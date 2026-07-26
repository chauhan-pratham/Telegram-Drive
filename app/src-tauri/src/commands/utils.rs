use grammers_client::Client;
use grammers_session::types::PeerRef;
use tauri::State;
use crate::bandwidth::BandwidthManager;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Resolve a folder_id to a Telegram PeerRef, using the cache for O(1) lookups.
///
/// - `folder_id == None` → returns the user's own peer (Saved Messages)
/// - Cache hit → returns immediately without any network call
/// - Cache miss → scans all dialogs, populates the cache, and returns
pub async fn resolve_peer(
    client: &Client,
    folder_id: Option<i64>,
    peer_cache: &Arc<RwLock<HashMap<i64, PeerRef>>>,
) -> Result<PeerRef, String> {
    // Treat virtual SAVED_MESSAGES_ID (-999) as None (Saved Messages / root folder)
    let folder_id = match folder_id {
        Some(-999) => None,
        other => other,
    };

    if let Some(fid) = folder_id {
        // Fast path: check cache
        {
            let cache = peer_cache.read().await;
            if let Some(peer_ref) = cache.get(&fid) {
                return Ok(*peer_ref);
            }
        }

        // Slow path: scan dialogs and populate cache
        log::debug!("Peer cache miss for folder_id={}, scanning dialogs...", fid);
        let mut found: Option<PeerRef> = None;
        let mut dialogs = client.iter_dialogs();
        let mut discovered = HashMap::new();
        while let Some(dialog) = dialogs.next().await.map_err(|e| e.to_string())? {
            let peer = &dialog.peer;
            // Get the numeric ID for this peer
            let peer_id = match peer {
                grammers_client::peer::Peer::Channel(c) => Some(c.raw.id),
                grammers_client::peer::Peer::User(u) => Some(u.raw.id()),
                grammers_client::peer::Peer::Group(g) => {
                    // Use the Group's id() method which returns PeerId
                    g.id().bare_id()
                },
                grammers_client::peer::Peer::Community(comm) => {
                    comm.id().bare_id()
                },
            };
            if let Some(id) = peer_id {
                // Resolve the peer to a PeerRef
                if let Ok(Some(peer_ref)) = peer.to_ref().await {
                    discovered.insert(id, peer_ref);
                    if id == fid {
                        found = Some(peer_ref);
                        // Don't break — keep scanning to warm the cache
                    }
                }
            }
        }

        {
            let mut cache = peer_cache.write().await;
            cache.extend(discovered);
        }

        found.ok_or_else(|| format!("Folder/Chat {} not found", fid))
    } else {
        // Fast path: check cache for key 0 (representing "me")
        {
            let cache = peer_cache.read().await;
            if let Some(peer_ref) = cache.get(&0) {
                return Ok(*peer_ref);
            }
        }

        match client.get_me().await {
            Ok(me) => {
                let peer = grammers_client::peer::Peer::User(me);
                match peer.to_ref().await {
                    Ok(Some(peer_ref)) => {
                        let mut cache = peer_cache.write().await;
                        cache.insert(0, peer_ref);
                        Ok(peer_ref)
                    }
                    Ok(None) => Err("Could not resolve self peer".to_string()),
                    Err(e) => Err(e.to_string()),
                }
            }
            Err(e) => Err(e.to_string()),
        }
    }
}

/// Clear the peer cache (called on logout)
pub async fn clear_peer_cache(peer_cache: &Arc<RwLock<HashMap<i64, PeerRef>>>) {
    peer_cache.write().await.clear();
}

#[tauri::command]
pub fn cmd_log(message: String) {
    log::info!("[FRONTEND] {}", message);
}

#[tauri::command]
pub fn cmd_get_bandwidth(bw_state: State<'_, Arc<BandwidthManager>>) -> crate::bandwidth::BandwidthStats {
    bw_state.get_stats()
}

pub fn map_error(e: impl std::fmt::Display) -> String {
    let err_str = e.to_string();
    if err_str.contains("FLOOD_WAIT") {
        // Expected format: ... (value: 1234)
        if let Some(start) = err_str.find("(value: ") {
             let rest = &err_str[start + 8..];
             if let Some(end) = rest.find(')') {
                 if let Ok(seconds) = rest[..end].parse::<i64>() {
                     return format!("FLOOD_WAIT_{}", seconds);
                 }
             }
        }
        // Fallback if parsing fails but we know it's a flood wait
        return "FLOOD_WAIT_60".to_string();
    }
    err_str
}
