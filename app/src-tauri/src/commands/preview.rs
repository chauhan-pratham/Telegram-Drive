use tauri::State;
use tauri::Manager;
use std::sync::Arc;
use grammers_client::media::{Media, Downloadable, PhotoSize};
use grammers_client::message::Message;
use grammers_session::types::PeerRef;
use grammers_tl_types as tl;
use base64::{Engine as _, engine::general_purpose};
use rand::Rng;
use tokio::io::AsyncWriteExt;
use tokio::io::AsyncSeekExt;

use std::io::SeekFrom;
use crate::TelegramState;
use crate::bandwidth::BandwidthManager;
use crate::commands::utils::resolve_peer;

/// Supported image file extensions for thumbnails.
/// Shared between Tauri commands and the REST API cache cleanup.
pub const THUMBNAIL_EXTS: &[&str] = &["jpg", "png", "gif", "webp"];
const IMAGE_EXTS: &[&str] = &[
    "jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "avif", "ico", "heic", "heif",
];

const PREVIEW_CACHE_MAX_FILES: usize = 30;
const PREVIEW_CACHE_MAX_TOTAL_BYTES: u64 = 256 * 1024 * 1024;

async fn prune_preview_cache(cache_dir: std::path::PathBuf, preserve_path: Option<std::path::PathBuf>) {
    let _ = tokio::task::spawn_blocking(move || {
        let mut read_dir = match std::fs::read_dir(&cache_dir) {
            Ok(entries) => entries,
            Err(_) => return,
        };

        // First pass: delete any orphaned .part files left behind by
        // interrupted downloads. These are always stale and never preserved.
        for entry in read_dir.by_ref().flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let fname = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if fname.ends_with(".part") {
                let _ = std::fs::remove_file(&path);
            }
        }

        // Second pass: gather remaining files for size-based pruning.
        // Re-read the directory to get a fresh iterator after the first pass
        // may have modified it.
        let read_dir = match std::fs::read_dir(&cache_dir) {
            Ok(entries) => entries,
            Err(_) => return,
        };
        let mut files: Vec<(std::path::PathBuf, std::time::SystemTime, u64)> = Vec::new();
        for entry in read_dir.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            if preserve_path.as_ref().is_some_and(|preserve| preserve == &path) {
                continue;
            }
            if let Ok(meta) = entry.metadata() {
                let modified = meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                files.push((path, modified, meta.len()));
            }
        }
        files.sort_by_key(|(_, modified, _)| *modified);
        let mut total_bytes: u64 = files.iter().map(|(_, _, len)| *len).sum();
        while files.len() > PREVIEW_CACHE_MAX_FILES || total_bytes > PREVIEW_CACHE_MAX_TOTAL_BYTES {
            if let Some((path, _, len)) = files.first().cloned() {
                let _ = std::fs::remove_file(&path);
                total_bytes = total_bytes.saturating_sub(len);
                files.remove(0);
            } else {
                break;
            }
        }
    }).await;
}

async fn get_message_cached(
    client: &grammers_client::Client,
    peer: PeerRef,
    message_id: i32,
    state: &TelegramState,
) -> Result<Message, String> {
    // Try loading message from in-memory cache
    {
        let cache = state.message_cache.read().await;
        if let Some(msg) = cache.get(&message_id) {
            return Ok(msg.clone());
        }
    }

    // Cache miss: fetch from Telegram
    let messages = client.get_messages_by_id(peer, &[message_id])
        .await
        .map_err(|e| e.to_string())?;
    
    let msg = messages
        .into_iter()
        .flatten()
        .next()
        .ok_or_else(|| "Message not found".to_string())?;

    // Store in cache
    {
        let mut cache = state.message_cache.write().await;
        if cache.len() > 10000 {
            cache.clear();
        }
        cache.insert(message_id, msg.clone());
    }

    Ok(msg)
}

/// Download media to a file using `iter_download` with manual chunk writing.
/// Returns the number of bytes written.
///
/// Unlike `grammers_client::Client::download_media`, this returns an explicit
/// error when the download produces zero bytes (e.g. stale file references or
/// Telegram CDN stream drops).
async fn download_to_file<D: Downloadable>(
    client: &grammers_client::Client,
    media: &D,
    part_path: &std::path::Path,
) -> Result<u64, String> {
    let mut file = tokio::fs::File::create(part_path)
        .await
        .map_err(|e| format!("Failed to create .part file: {}", e))?;

    let mut download_iter = client.iter_download(media);
    download_iter = download_iter.chunk_size(65536);
    let mut written: u64 = 0;

    loop {
        match download_iter.next().await {
            Ok(Some(chunk)) => {
                file.write_all(&chunk)
                    .await
                    .map_err(|e| format!("Write error: {}", e))?;
                written += chunk.len() as u64;
            }
            Ok(None) => break,
            Err(e) => {
                let _ = tokio::fs::remove_file(part_path).await;
                return Err(format!("Download error: {}", e));
            }
        }
    }

    file.flush()
        .await
        .map_err(|e| format!("Flush error: {}", e))?;
    drop(file);

    if written == 0 {
        let _ = tokio::fs::remove_file(part_path).await;
        return Err("Download produced zero bytes (stale file reference or stream drop)".to_string());
    }

    Ok(written)
}

fn media_thumbs(media: &Media) -> Vec<PhotoSize> {
    match media {
        Media::Photo(p) => p.thumbs(),
        Media::Document(d) => d.thumbs(),
        _ => vec![],
    }
}

fn thumb_mime_for_ext(ext: &str) -> &'static str {
    match ext {
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        _ => "image/jpeg",
    }
}

async fn read_thumb_as_data_url(path: &std::path::Path, ext: &str) -> Option<String> {
    let bytes = tokio::fs::read(path).await.ok()?;
    if bytes.is_empty() || bytes.len() > 20 * 1024 * 1024 {
        return None;
    }
    Some(format!("data:{};base64,{}", thumb_mime_for_ext(ext), general_purpose::STANDARD.encode(&bytes)))
}


/// Download Telegram's built-in preview image when available.
async fn fetch_telegram_thumb_data_url(
    client: &grammers_client::Client,
    peer: PeerRef,
    message_id: i32,
    media: &Media,
    cache_dir: &std::path::Path,
    folder_key: &str,
    ext: &str,
    allow_full_media_fallback: bool,
    state: &TelegramState,
) -> Result<Option<String>, String> {
    let save_path = cache_dir.join(format!("{}_{}.{}", folder_key, message_id, ext));

    if tokio::fs::metadata(&save_path).await.map_or(false, |m| m.len() > 0) {
        return Ok(read_thumb_as_data_url(&save_path, ext).await);
    }

    let thumbs = media_thumbs(media);
    if thumbs.is_empty() && !allow_full_media_fallback {
        return Ok(None);
    }

    let unique_id = rand::rng().random::<u64>();
    let part_path = save_path.with_extension(format!("{}_{}.part", ext, unique_id));
    let mut download_ok = false;

    let _ = tokio::fs::remove_file(&part_path).await;
    if let Some(thumb) = thumbs.iter().filter(|t| t.size() > 0).max_by_key(|t| t.size()) {
        if download_to_file(client, thumb, &part_path).await.is_ok() {
            download_ok = true;
        }
    } else if allow_full_media_fallback && download_to_file(client, media, &part_path).await.is_ok() {
        download_ok = true;
    }

    if !download_ok {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        if let Ok(fresh_messages) = client.get_messages_by_id(peer, &[message_id]).await {
            if let Some(fresh_msg) = fresh_messages.into_iter().flatten().next() {
                // Update cache with fresh message object
                {
                    let mut cache = state.message_cache.write().await;
                    cache.insert(message_id, fresh_msg.clone());
                }
                if let Some(fresh_media) = fresh_msg.media() {
                    let fresh_thumbs = media_thumbs(&fresh_media);
                    let _ = tokio::fs::remove_file(&part_path).await;
                    if let Some(fresh_thumb) = fresh_thumbs.iter().filter(|t| t.size() > 0).max_by_key(|t| t.size()) {
                        if download_to_file(client, fresh_thumb, &part_path).await.is_ok() {
                            download_ok = true;
                        }
                    } else if allow_full_media_fallback
                        && download_to_file(client, &fresh_media, &part_path).await.is_ok()
                    {
                        download_ok = true;
                    }
                }
            }
        }
    }

    if !download_ok {
        let _ = tokio::fs::remove_file(&part_path).await;
        return Ok(None);
    }

    match tokio::fs::rename(&part_path, &save_path).await {
        Ok(_) => Ok(read_thumb_as_data_url(&save_path, ext).await),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            Ok(read_thumb_as_data_url(&save_path, ext).await)
        }
        Err(_) => {
            let _ = tokio::fs::remove_file(&part_path).await;
            Ok(None)
        }
    }
}

async fn generate_video_thumb_with_ffmpeg(
    app_handle: &tauri::AppHandle,
    temp_download_path: &std::path::Path,
    thumb_path: &std::path::Path,
) -> bool {
    let Some(ffmpeg_path) = crate::transcode::detect_ffmpeg(app_handle).await else {
        log::warn!("Cannot generate video thumbnail: FFmpeg was not found");
        return false;
    };

    for seek in ["00:00:01", "00:00:00"] {
        let res = tokio::process::Command::new(&ffmpeg_path)
            .args([
                "-ss",
                seek,
                "-i",
                &temp_download_path.to_string_lossy(),
                "-vf",
                "scale=320:-1",
                "-vframes",
                "1",
                "-f",
                "image2",
                "-c:v",
                "mjpeg",
                "-y",
                &thumb_path.to_string_lossy(),
            ])
            .output()
            .await;

        if res.as_ref().is_ok_and(|output| output.status.success()) && thumb_path.exists() {
            return true;
        }
    }

    false
}

#[cfg(target_os = "windows")]
async fn generate_pdf_thumb_with_powershell(
    temp_download_path: &std::path::Path,
    thumb_path: &std::path::Path,
) -> bool {
    let script = format!(
        r#"
        $ErrorActionPreference = 'Stop'
        try {{
            [void][System.Reflection.Assembly]::LoadWithPartialName("System.Drawing")
            [void][Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType=WindowsRuntime]
            $pdfPath = '{}'
            $imagePath = '{}'
            $file = [Windows.Storage.StorageFile]::GetFileFromPathAsync($pdfPath).GetAwaiter().GetResult()
            $pdf = [Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file).GetAwaiter().GetResult()
            $page = $pdf.GetPage(0)
            $stream = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
            $options = New-Object Windows.Data.Pdf.PdfPageRenderOptions
            $page.RenderToStreamAsync($stream, $options).GetAwaiter().GetResult()
            $stream.Seek(0)
            $reader = New-Object Windows.Storage.Streams.DataReader($stream)
            $reader.LoadAsync($stream.Size).GetAwaiter().GetResult()
            $bytes = New-Object byte[] ([int]$stream.Size)
            $reader.ReadBytes($bytes)
            [System.IO.File]::WriteAllBytes($imagePath, $bytes)
            exit 0
        }} catch {{
            Write-Error $_.Exception.Message
            exit 1
        }}
        "#,
        temp_download_path.to_string_lossy().replace('\'', "''"),
        thumb_path.to_string_lossy().replace('\'', "''")
    );

    let output_res = tokio::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .output()
        .await;

    if !output_res.as_ref().is_ok_and(|output| output.status.success()) {
        if let Ok(output) = output_res {
            log::warn!("PDF thumbnail generation failed: {}", String::from_utf8_lossy(&output.stderr));
        }
        return false;
    }
    thumb_path.exists()
}

#[cfg(not(target_os = "windows"))]
async fn generate_pdf_thumb_with_powershell(
    _temp_download_path: &std::path::Path,
    _thumb_path: &std::path::Path,
) -> bool {
    false
}

async fn download_sparse_parts<D: Downloadable>(
    client: &grammers_client::Client,
    media: &D,
    save_path: &std::path::Path,
    total_size: u64,
    first_part_size: u64,
    last_part_size: u64,
) -> Result<(), String> {
    // Create the file and set its length to total_size to make it sparse
    let mut file = tokio::fs::File::create(save_path)
        .await
        .map_err(|e| format!("Failed to create file: {}", e))?;
    
    file.set_len(total_size)
        .await
        .map_err(|e| format!("Failed to set file length: {}", e))?;
        
    // 1. Download the first part (starting at offset 0)
    let mut download_iter = client.iter_download(media);
    download_iter = download_iter.chunk_size(65536);
    let mut written: u64 = 0;
    
    file.seek(SeekFrom::Start(0))
        .await
        .map_err(|e| format!("Seek error: {}", e))?;
        
    loop {
        if written >= first_part_size {
            break;
        }
        match download_iter.next().await {
            Ok(Some(chunk)) => {
                file.write_all(&chunk)
                    .await
                    .map_err(|e| format!("Write error: {}", e))?;
                written += chunk.len() as u64;
            }
            Ok(None) => break,
            Err(e) => {
                return Err(format!("Download error: {}", e));
            }
        }
    }
    
    // 2. Download the last part (if the file is larger than first_part_size + last_part_size)
    if total_size > first_part_size + last_part_size {
        let last_start = total_size.saturating_sub(last_part_size);
        let chunk_index = (last_start / 65536) as i32;
        
        file.seek(SeekFrom::Start(chunk_index as u64 * 65536))
            .await
            .map_err(|e| format!("Seek error: {}", e))?;
            
        let mut last_download_iter = client.iter_download(media);
        last_download_iter = last_download_iter.chunk_size(65536);
        if chunk_index > 0 {
            last_download_iter = last_download_iter.skip_chunks(chunk_index);
        }
        
        loop {
            match last_download_iter.next().await {
                Ok(Some(chunk)) => {
                    file.write_all(&chunk)
                        .await
                        .map_err(|e| format!("Write error: {}", e))?;
                }
                Ok(None) => break,
                Err(e) => {
                    return Err(format!("Last part download error: {}", e));
                }
            }
        }
    }
    
    file.flush()
        .await
        .map_err(|e| format!("Flush error: {}", e))?;
        
    Ok(())
}

#[tauri::command]
pub async fn cmd_get_preview(
    message_id: i32,
    folder_id: Option<i64>,
    thumbnail: Option<bool>,
    app_handle: tauri::AppHandle,
    state: State<'_, TelegramState>,
    bw_state: State<'_, Arc<BandwidthManager>>,
) -> Result<String, String> {
    log::info!(
        target: "preview",
        "preview.command_dispatched message_id={} folder_id={:?} thumbnail={:?}",
        message_id,
        folder_id,
        thumbnail
    );

    let result = Box::pin(get_preview_inner(
        message_id,
        folder_id,
        thumbnail,
        app_handle,
        state,
        bw_state,
    ))
    .await;

    if let Err(error) = &result {
        log::error!(
            target: "preview",
            "preview.command_failed message_id={} folder_id={:?} thumbnail={:?} error={}",
            message_id,
            folder_id,
            thumbnail,
            error
        );
    }

    result
}

async fn get_preview_inner(
    message_id: i32,
    folder_id: Option<i64>,
    thumbnail: Option<bool>,
    app_handle: tauri::AppHandle,
    state: State<'_, TelegramState>,
    bw_state: State<'_, Arc<BandwidthManager>>,
) -> Result<String, String> {
    use tauri::Manager;

    log::info!(
        target: "preview",
        "preview.start message_id={} folder_id={:?} thumbnail={:?}",
        message_id,
        folder_id,
        thumbnail
    );

    // Fast path: Check if file is available in local offline storage first
    if let Ok(data_dir) = app_handle.path().app_data_dir() {
        let offline_dir = data_dir.join("offline_storage");
        if offline_dir.exists() {
            let prefix = format!("{}_", message_id);
            if let Ok(entries) = std::fs::read_dir(&offline_dir) {
                for entry in entries.flatten() {
                    let fname = entry.file_name().to_string_lossy().to_string();
                    if fname.starts_with(&prefix) || fname == message_id.to_string() {
                        let path = entry.path();
                        if path.exists() && std::fs::metadata(&path).map(|m| m.len() > 0).unwrap_or(false) {
                            let fname_lower = fname.to_lowercase();
                            let is_img = IMAGE_EXTS.iter().any(|ext| fname_lower.ends_with(&format!(".{}", ext)));
                            if is_img {
                                log::info!(target: "preview", "preview.offline_image message_id={} path={}", message_id, path.display());
                                let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("jpg");
                                if let Some(data_url) = read_thumb_as_data_url(&path, ext).await {
                                    return Ok(data_url);
                                }
                                return Ok(path.to_string_lossy().to_string());
                            }

                            return Ok(path.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
    }

    let cache_dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|e: tauri::Error| e.to_string())?
        .join("previews");
    if tokio::fs::metadata(&cache_dir).await.is_err() {
        let _ = tokio::fs::create_dir_all(&cache_dir).await;
    }

    if thumbnail == Some(true) {
        let folder_key = folder_id
            .map(|id| id.to_string())
            .unwrap_or_else(|| "home".to_string());

        let client_opt = { state.client.lock().await.clone() };
        #[cfg(debug_assertions)]
        if client_opt.is_none() {
            return Ok("".to_string());
        }
        let client = client_opt.ok_or_else(|| "Client not connected".to_string())?;

        let peer = resolve_peer(&client, folder_id, &state.peer_cache).await?;
        if let Ok(m) = get_message_cached(&client, peer, message_id, &state).await {
            if let Some(media) = m.media() {
                let mut is_video = false;
                let mut is_pdf = false;

                match &media {
                    Media::Document(d) => {
                        let mime = d.mime_type().unwrap_or("").to_lowercase();
                        let name = d.name().unwrap_or("").to_lowercase();
                        if name.ends_with(".mp4") || name.ends_with(".mkv") || name.ends_with(".webm") || name.ends_with(".mov") || name.ends_with(".avi") || mime.starts_with("video/") ||
                           d.raw.document.as_ref().and_then(|doc| {
                               Some(std::matches!(doc, tl::enums::Document::Document(ref inner) if inner.attributes.iter().any(|a| std::matches!(a, tl::enums::DocumentAttribute::Video(_)))))
                           }).unwrap_or(false)
                        {
                            is_video = true;
                        } else if name.ends_with(".pdf") || mime == "application/pdf" {
                            is_pdf = true;
                        }
                    }
                    _ => {}
                }

                if is_video || is_pdf {
                    let thumb_ext = if is_pdf { "png" } else { "jpg" };
                    let thumb_path = cache_dir.join(format!("{}_{}.{}", folder_key, message_id, thumb_ext));

                    if tokio::fs::metadata(&thumb_path).await.is_ok() {
                        return Ok(thumb_path.to_string_lossy().to_string());
                    }

                    if is_video {
                        if fetch_telegram_thumb_data_url(
                            &client,
                            peer,
                            message_id,
                            &media,
                            &cache_dir,
                            &folder_key,
                            "jpg",
                            false,
                            &state,
                        ).await?.is_some() && thumb_path.exists() {
                            prune_preview_cache(cache_dir.clone(), Some(thumb_path.clone())).await;
                            return Ok(thumb_path.to_string_lossy().to_string());
                        }
                    }

                    let total_size = match &media {
                        Media::Document(d) => d.size().unwrap_or(0) as u64,
                        _ => 0,
                    };

                    let unique_id = rand::rng().random::<u64>();
                    let temp_download_path = cache_dir.join(format!("{}_{}_temp_{}.bin", folder_key, message_id, unique_id));

                    if is_pdf || total_size <= 3 * 1024 * 1024 {
                        download_to_file(&client, &media, &temp_download_path).await?;
                    } else {
                        download_sparse_parts(
                            &client,
                            &media,
                            &temp_download_path,
                            total_size,
                            2 * 1024 * 1024,
                            512 * 1024,
                        ).await?;
                    }

                    let gen_success = if is_video {
                        generate_video_thumb_with_ffmpeg(&app_handle, &temp_download_path, &thumb_path).await
                    } else {
                        generate_pdf_thumb_with_powershell(&temp_download_path, &thumb_path).await
                    };

                    let _ = tokio::fs::remove_file(&temp_download_path).await;

                    if gen_success {
                        prune_preview_cache(cache_dir.clone(), Some(thumb_path.clone())).await;
                        return Ok(thumb_path.to_string_lossy().to_string());
                    }
                }
            }
        }
        return Err("Failed to generate preview thumbnail".to_string());
    }
    let folder_key = folder_id
        .map(|id| id.to_string())
        .unwrap_or_else(|| "home".to_string());

    // Fast path: Serve cached preview from disk if available (works offline without network)
    let supported_exts = &["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "avif", "ico", "heic", "heif", "pdf", "mp4"];
    for ext in supported_exts {
        let save_path = cache_dir.join(format!("{}_{}.{}", folder_key, message_id, ext));
        if let Ok(meta) = tokio::fs::metadata(&save_path).await {
            if meta.len() > 0 {
                let save_path_str = save_path.to_string_lossy().to_string();
                let lower_ext = ext.to_lowercase();
                if IMAGE_EXTS.contains(&lower_ext.as_str()) {
                    log::info!(target: "preview", "preview.cache_image message_id={} path={} bytes={}", message_id, save_path.display(), meta.len());
                    if let Some(data_url) = read_thumb_as_data_url(&save_path, &lower_ext).await {
                        return Ok(data_url);
                    }
                    return Ok(save_path_str);
                }

                return Ok(save_path_str);
            }
        }
    }

    let client_opt = { state.client.lock().await.clone() };
    #[cfg(debug_assertions)]
    if client_opt.is_none() {
        return Ok("".to_string());
    }
    let client = client_opt.ok_or_else(|| "Client not connected".to_string())?;

    let peer = resolve_peer(&client, folder_id, &state.peer_cache).await?;
    let target_message = get_message_cached(&client, peer, message_id, &state).await.ok();

    if let Some(msg) = target_message {
        if let Some(media) = msg.media() {
            let ext = match &media {
                Media::Document(d) => {
                    let mut e = std::path::Path::new(d.name().unwrap_or(""))
                        .extension()
                        .map(|s| s.to_string_lossy().to_string())
                        .unwrap_or_default();
                    if e.is_empty() {
                        if let Some(mime) = d.mime_type() {
                            e = match mime {
                                "image/jpeg" => "jpg".to_string(),
                                "image/png" => "png".to_string(),
                                "image/gif" => "gif".to_string(),
                                "image/webp" => "webp".to_string(),
                                "image/bmp" => "bmp".to_string(),
                                "image/svg+xml" => "svg".to_string(),
                                "image/avif" => "avif".to_string(),
                                "image/x-icon" | "image/vnd.microsoft.icon" => "ico".to_string(),
                                "image/heic" => "heic".to_string(),
                                "image/heif" => "heif".to_string(),
                                "application/pdf" => "pdf".to_string(),
                                "video/mp4" => "mp4".to_string(),
                                _ => "bin".to_string(),
                            };
                        } else {
                            e = "bin".to_string();
                        }
                    }
                    e
                },
                Media::Photo(_) => "jpg".to_string(),
                _ => "bin".to_string(),
            };
            let folder_key = folder_id
                .map(|id| id.to_string())
                .unwrap_or_else(|| "home".to_string());
            let save_path = cache_dir.join(format!("{}_{}.{}", folder_key, message_id, ext));
            let save_path_str = save_path.to_string_lossy().to_string();

            let is_image = matches!(&media, Media::Photo(_)) || match &media {
                Media::Document(d) => {
                    let mime = d.mime_type().unwrap_or("").to_lowercase();
                    let name = d.name().unwrap_or("").to_lowercase();
                    mime.starts_with("image/") || IMAGE_EXTS.iter().any(|ext| name.ends_with(&format!(".{}", ext)))
                }
                _ => false,
            };

            if is_image {
                log::info!(target: "preview", "preview.fetch_thumbnail message_id={} ext={}", message_id, ext);
                if let Ok(Some(data_url)) = fetch_telegram_thumb_data_url(
                    &client,
                    peer,
                    message_id,
                    &media,
                    &cache_dir,
                    &folder_key,
                    "jpg",
                    false,
                    &state,
                ).await {
                    log::info!(target: "preview", "preview.return_thumbnail message_id={} data_url_bytes={}", message_id, data_url.len());
                    return Ok(data_url);
                }
            } else {
                return Err("Preview not supported for non-image file types".to_string());
            }

            // Prune the cache here, explicitly preserving the active file being previewed
            prune_preview_cache(cache_dir.clone(), Some(save_path.clone())).await;

            let cached_meta = tokio::fs::metadata(&save_path).await.ok();
            let file_ready = if cached_meta.as_ref().is_some_and(|meta| meta.len() > 0) {
                log::info!("File ({}) exists in cache.", message_id);
                true
            } else {
                if cached_meta.is_some() {
                    log::warn!("Preview cache file was empty; redownloading: {}", save_path_str);
                    let _ = tokio::fs::remove_file(&save_path).await;
                }
                let size = match &media {
                    Media::Document(d) => d.size().unwrap_or(0) as u64,
                    Media::Photo(_) => 1024 * 1024,
                    _ => 0,
                };
                log::info!("Downloading preview... Size: {}", size);
                log::info!(target: "preview", "preview.download_full_start message_id={} path={} expected_bytes={}", message_id, save_path.display(), size);
                if let Err(e) = bw_state.try_reserve_down(size) {
                    log::warn!("Bandwidth limit hit for preview: {}", e);
                    false
                } else {
                    let unique_id = rand::rng().random::<u64>();
                    let part_path = save_path.with_extension(format!("{}_{}.part", ext, unique_id));

                    let mut download_ok = false;

                    if tokio::fs::metadata(&save_path).await.map_or(false, |m| m.len() > 0) {
                        log::info!("Preview already downloaded by concurrent request (final file exists)");
                        bw_state.release_down(size);
                        download_ok = true;
                    }

                    if !download_ok {
                        let _ = tokio::fs::remove_file(&part_path).await;
                        match download_to_file(&client, &media, &part_path).await {
                            Ok(written) => {
                                log::info!("Preview download complete: {} bytes.", written);
                                log::info!(target: "preview", "preview.download_full_complete message_id={} bytes={}", message_id, written);
                                match tokio::fs::rename(&part_path, &save_path).await {
                                    Ok(_) => {
                                        download_ok = true;
                                        prune_preview_cache(cache_dir.clone(), Some(save_path.clone())).await;
                                    },
                                    Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                                        if tokio::fs::metadata(&save_path).await.map_or(false, |m| m.len() > 0) {
                                            log::info!("Preview already downloaded by concurrent request");
                                            download_ok = true;
                                        }
                                    },
                                    Err(e) => {
                                        log::error!("Failed to rename part file to final path: {}", e);
                                        let _ = tokio::fs::remove_file(&part_path).await;
                                    }
                                }
                            },
                            Err(e) => {
                                log::error!("Preview Download Error (attempt 1/2): {}", e);
                            }
                        }
                    }

                    if !download_ok {
                        tokio::time::sleep(std::time::Duration::from_millis(500)).await;

                        if let Ok(fresh_messages) = client.get_messages_by_id(peer, &[message_id]).await {
                            if let Some(fresh_msg) = fresh_messages.into_iter().flatten().next() {
                                if let Some(fresh_media) = fresh_msg.media() {
                                    let _ = tokio::fs::remove_file(&part_path).await;
                                    match download_to_file(&client, &fresh_media, &part_path).await {
                                        Ok(written) => {
                                            log::info!("Preview download complete after re-fetch: {} bytes.", written);
                                            match tokio::fs::rename(&part_path, &save_path).await {
                                                Ok(_) => {
                                                    download_ok = true;
                                                    prune_preview_cache(cache_dir.clone(), Some(save_path.clone())).await;
                                                },
                                                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                                                    if tokio::fs::metadata(&save_path).await.map_or(false, |m| m.len() > 0) {
                                                        log::info!("Preview already downloaded by concurrent request");
                                                        download_ok = true;
                                                    }
                                                },
                                                Err(e) => {
                                                    log::error!("Failed to rename part file to final path: {}", e);
                                                    let _ = tokio::fs::remove_file(&part_path).await;
                                                }
                                            }
                                        },
                                        Err(e) => {
                                            log::error!("Preview Download Error (attempt 2/2): {}", e);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    if !download_ok {
                        bw_state.release_down(size);
                    }
                    download_ok
                }
            };
            if file_ready {
                let lower_ext = ext.to_lowercase();
                if IMAGE_EXTS.contains(&lower_ext.as_str()) {
                    log::info!(target: "preview", "preview.return_image_path message_id={} path={}", message_id, save_path.display());
                    return Ok(save_path_str);
                }
                log::info!("Returning path preview: {}", save_path_str);
                return Ok(save_path_str);
            }
        }
    }
    Err("File not found or failed to download".to_string())
}

#[tauri::command]
pub async fn cmd_clean_preview_cache(
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let cache_dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|e: tauri::Error| e.to_string())?
        .join("previews");

    let _ = tokio::task::spawn_blocking(move || {
        if cache_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(cache_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() {
                        let _ = std::fs::remove_file(path);
                    }
                }
            }
        }
    }).await;
    Ok(())
}

#[tauri::command]
pub async fn cmd_clean_cache(
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let cache_dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|e: tauri::Error| e.to_string())?
        .join("previews");
    let thumb_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())?
        .join("thumbnails");

    let _ = tokio::task::spawn_blocking(move || {
        if cache_dir.exists() {
            let _ = std::fs::remove_dir_all(cache_dir);
        }
        if thumb_dir.exists() {
            let _ = std::fs::remove_dir_all(thumb_dir);
        }
    }).await;
    Ok(())
}

/// Get a small thumbnail for inline display in file cards.
/// Returns base64 data URL for images, empty string for non-image files.
/// Uses same cache as cmd_get_preview for consistency.
#[tauri::command]
pub async fn cmd_get_thumbnail(
    message_id: i32,
    folder_id: Option<i64>,
    app_handle: tauri::AppHandle,
    state: State<'_, TelegramState>,
) -> Result<String, String> {
    // Check if thumbnail already in cache
    let cache_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())?
        .join("thumbnails");
    if tokio::fs::metadata(&cache_dir).await.is_err() {
        let _ = tokio::fs::create_dir_all(&cache_dir).await;
    }

    let folder_key = folder_id
        .map(|id| id.to_string())
        .unwrap_or_else(|| "home".to_string());

    // Check for any cached thumbnail for this message by checking predicted paths
    let supported_exts = THUMBNAIL_EXTS;
    for ext in supported_exts {
        let path = cache_dir.join(format!("{}_{}.{}", folder_key, message_id, ext));
        if tokio::fs::metadata(&path).await.is_ok() {
            if let Ok(bytes) = tokio::fs::read(&path).await {
                let mime = match *ext {
                    "png" => "image/png",
                    "gif" => "image/gif",
                    "webp" => "image/webp",
                    _ => "image/jpeg",
                };
                let b64 = general_purpose::STANDARD.encode(&bytes);
                return Ok(format!("data:{};base64,{}", mime, b64));
            }
        }
    }

    // No cache, need to fetch from Telegram
    let client_opt = { state.client.lock().await.clone() };
    #[cfg(debug_assertions)]
    if client_opt.is_none() {
        return Ok("".to_string());
    }
    let client = client_opt.ok_or_else(|| "Client not connected".to_string())?;

    let peer = resolve_peer(&client, folder_id, &state.peer_cache).await?;
    if let Ok(m) = get_message_cached(&client, peer, message_id, &state).await {
        if let Some(media) = m.media() {
            let mut is_image = false;
            let mut is_video = false;
            let mut is_pdf = false;

            match &media {
                Media::Photo(_) => {
                    is_image = true;
                }
                Media::Document(d) => {
                    let mime = d.mime_type().unwrap_or("");
                    let name = d.name().unwrap_or("").to_lowercase();
                    if mime.starts_with("image/") {
                        is_image = true;
                    } else if name.ends_with(".mp4") || name.ends_with(".mkv") || name.ends_with(".webm") || mime.starts_with("video/") {
                        is_video = true;
                    } else if name.ends_with(".pdf") || mime == "application/pdf" {
                        is_pdf = true;
                    }
                }
                _ => {}
            }

            if is_image {
                if let Some(data_url) = fetch_telegram_thumb_data_url(
                    &client,
                    peer,
                    message_id,
                    &media,
                    &cache_dir,
                    &folder_key,
                    "jpg",
                    true,
                    &state,
                ).await? {
                    return Ok(data_url);
                }
            } else if is_video || is_pdf {
                let thumb_ext = if is_pdf { "png" } else { "jpg" };
                let save_path = cache_dir.join(format!("{}_{}.{}", folder_key, message_id, thumb_ext));

                if let Some(data_url) = read_thumb_as_data_url(&save_path, thumb_ext).await {
                    return Ok(data_url);
                }

                if is_video {
                    if let Some(data_url) = fetch_telegram_thumb_data_url(
                        &client,
                        peer,
                        message_id,
                        &media,
                        &cache_dir,
                        &folder_key,
                        "jpg",
                        false,
                        &state,
                    ).await? {
                        return Ok(data_url);
                    }

                    // Frame extraction requires FFmpeg. Let the frontend use
                    // its WebView frame-capture fallback when it is not
                    // installed instead of downloading video data needlessly.
                    if crate::transcode::detect_ffmpeg(&app_handle).await.is_none() {
                        return Ok("".to_string());
                    }
                }

                let total_size = match &media {
                    Media::Document(d) => d.size().unwrap_or(0) as u64,
                    _ => 0,
                };

                let unique_id = rand::rng().random::<u64>();
                let temp_download_path = cache_dir.join(format!("{}_{}_temp_{}.bin", folder_key, message_id, unique_id));

                if is_pdf || total_size <= 3 * 1024 * 1024 {
                    download_to_file(&client, &media, &temp_download_path).await?;
                } else {
                    download_sparse_parts(
                        &client,
                        &media,
                        &temp_download_path,
                        total_size,
                        2 * 1024 * 1024,
                        512 * 1024,
                    ).await?;
                }

                let mut gen_success = if is_video {
                    generate_video_thumb_with_ffmpeg(&app_handle, &temp_download_path, &save_path).await
                } else {
                    generate_pdf_thumb_with_powershell(&temp_download_path, &save_path).await
                };

                // Sparse MP4 data is quick to fetch but may not contain a
                // decodable keyframe. For reasonably sized videos, retry with
                // the complete file before giving up on a thumbnail.
                const FULL_VIDEO_THUMBNAIL_LIMIT: u64 = 32 * 1024 * 1024;
                if is_video && !gen_success && total_size <= FULL_VIDEO_THUMBNAIL_LIMIT {
                    let _ = tokio::fs::remove_file(&temp_download_path).await;
                    if download_to_file(&client, &media, &temp_download_path).await.is_ok() {
                        gen_success = generate_video_thumb_with_ffmpeg(
                            &app_handle,
                            &temp_download_path,
                            &save_path,
                        ).await;
                    }
                }

                let _ = tokio::fs::remove_file(&temp_download_path).await;

                if gen_success {
                    if let Some(data_url) = read_thumb_as_data_url(&save_path, thumb_ext).await {
                        return Ok(data_url);
                    }
                }
            }
        }
    }

    Ok("".to_string())
}

/// Delete stale preview cache entries for a specific message in a specific folder.
/// Preview cache files are named `{folder_key}_{message_id}.{ext}`.
/// This removes all extensions for the given folder+message_id pair.
#[tauri::command]
pub async fn cmd_delete_preview_for_message(
    message_id: i32,
    folder_id: Option<i64>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let cache_dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|e: tauri::Error| e.to_string())?
        .join("previews");

    let folder_key = folder_id
        .map(|id| id.to_string())
        .unwrap_or_else(|| "home".to_string());

    let prefix = format!("{}_{}.", folder_key, message_id);

    let _ = tokio::task::spawn_blocking(move || {
        if let Ok(entries) = std::fs::read_dir(&cache_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_file() {
                    continue;
                }
                let fname = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                if fname.starts_with(&prefix) {
                    let _ = std::fs::remove_file(&path);
                }
            }
        }
    }).await;
    Ok(())
}

#[tauri::command]
pub async fn cmd_delete_image_thumbnail(
    message_id: i32,
    folder_id: Option<i64>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let cache_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())?
        .join("thumbnails");
        
    let folder_key = folder_id
        .map(|id| id.to_string())
        .unwrap_or_else(|| "home".to_string());

    let _ = tokio::task::spawn_blocking(move || {
        let supported_exts = THUMBNAIL_EXTS;
        for ext in supported_exts {
            let path = cache_dir.join(format!("{}_{}.{}", folder_key, message_id, ext));
            if path.exists() {
                let _ = std::fs::remove_file(path);
            }
        }
    }).await;
    Ok(())
}

#[tauri::command]
pub async fn cmd_get_local_cache_path(
    message_id: i32,
    file_name: String,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    let cache_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("local_cache");
        
    if !cache_dir.exists() {
        let _ = std::fs::create_dir_all(&cache_dir);
    }
    
    let ext = std::path::Path::new(&file_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("mp4");
        
    let cache_file = cache_dir.join(format!("{}.{}", message_id, ext));
    Ok(cache_file.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn cmd_clean_local_cache(
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let cache_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("local_cache");

    if cache_dir.exists() {
        let _ = tokio::task::spawn_blocking(move || {
            if let Ok(entries) = std::fs::read_dir(cache_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() {
                        let _ = std::fs::remove_file(path);
                    }
                }
            }
        }).await;
    }
    Ok(())
}
