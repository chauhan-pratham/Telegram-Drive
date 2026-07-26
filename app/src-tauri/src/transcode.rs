use actix_web::web;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct TranscodeManager {
    pub cache_dir: PathBuf,
    pub ffmpeg_path: Arc<Mutex<Option<String>>>,
}

impl TranscodeManager {
    pub fn new(cache_dir: PathBuf) -> Self {
        Self {
            cache_dir,
            ffmpeg_path: Arc::new(Mutex::new(None)),
        }
    }
}

pub async fn detect_ffmpeg(_app_handle: &tauri::AppHandle) -> Option<String> {
    None
}

pub fn configure_hls_routes(_cfg: &mut web::ServiceConfig) {
    // HLS route configuration
}
