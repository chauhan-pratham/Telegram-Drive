use std::sync::Arc;
use std::collections::{HashMap, HashSet};
use tokio::sync::Mutex;
use grammers_client::{Client};
use grammers_client::client::{LoginToken, PasswordToken};
use grammers_session::types::PeerRef;

/// Tracks the lifecycle of the Telegram connection
/// 
/// IMPORTANT: The `runner_shutdown` field is critical for preventing stack overflow.
pub struct TokenBucket {
    pub capacity: usize,
    pub refill_rate: usize, // bytes per second
    pub available_tokens: f64,
    pub last_refill: std::time::Instant,
}

impl TokenBucket {
    pub fn new(capacity: usize, refill_rate: usize) -> Self {
        Self {
            capacity,
            refill_rate,
            available_tokens: capacity as f64,
            last_refill: std::time::Instant::now(),
        }
    }

    pub fn consume(&mut self, amount: usize) -> Result<(), std::time::Duration> {
        let now = std::time::Instant::now();
        let elapsed = now.duration_since(self.last_refill).as_secs_f64();
        self.last_refill = now;
        
        self.available_tokens = (self.capacity as f64).min(self.available_tokens + elapsed * (self.refill_rate as f64));
        
        if self.available_tokens >= amount as f64 {
            self.available_tokens -= amount as f64;
            Ok(())
        } else {
            let deficit = amount as f64 - self.available_tokens;
            let wait_secs = deficit / (self.refill_rate as f64);
            Err(std::time::Duration::from_secs_f64(wait_secs))
        }
    }

    pub fn set_rate(&mut self, refill_rate: usize) {
        self.refill_rate = refill_rate;
        self.capacity = refill_rate;
        self.available_tokens = (refill_rate as f64).min(self.available_tokens);
    }
}

/// When reconnecting, we MUST shutdown the old runner before spawning a new one.
/// Without this, runner tasks accumulate and exhaust the thread stack.
#[derive(Clone)]
pub struct TelegramState {
    pub client: Arc<Mutex<Option<Client>>>,
    pub login_token: Arc<Mutex<Option<LoginToken>>>,
    pub password_token: Arc<Mutex<Option<PasswordToken>>>,
    pub api_id: Arc<Mutex<Option<i32>>>,
    /// Send to this channel to request runner shutdown.
    /// Uses std::sync::Mutex (not tokio) so it can be locked from synchronous
    /// contexts like the RunEvent::Exit handler.
    pub runner_shutdown: Arc<std::sync::Mutex<Option<tokio::sync::oneshot::Sender<()>>>>,
    /// Counter for debugging runner lifecycle
    pub runner_count: Arc<std::sync::atomic::AtomicU32>,
    /// Cache of folder_id → Peer to avoid O(N) dialog scanning on every operation.
    /// Populated lazily on first resolve_peer call, eagerly during cmd_scan_folders.
    /// Cleared on logout.
    pub peer_cache: Arc<tokio::sync::RwLock<HashMap<i64, PeerRef>>>,
    /// Set of transfer IDs that have been cancelled. Checked cooperatively
    /// in upload/download chunk loops. Cleared on logout.
    pub cancelled_transfers: Arc<tokio::sync::RwLock<HashSet<String>>>,
    /// Shared rate limiter bucket for uploads
    pub upload_limiter: Arc<std::sync::Mutex<TokenBucket>>,
    /// Active upload task count for reference counting Android foreground service
    pub active_uploads: Arc<std::sync::atomic::AtomicU32>,
    /// Cache of message ID → Message to avoid fetching them again for previews/thumbnails.
    pub message_cache: Arc<tokio::sync::RwLock<HashMap<i32, grammers_client::message::Message>>>,
}

pub mod auth;
pub mod fs;
pub mod preview;
pub mod utils;
pub mod network;
pub mod streaming;
pub mod api_settings;
pub mod settings;
pub mod sharing;
pub mod video_metadata;
pub mod archive;
pub mod folder_groups;

pub use auth::*;
pub use fs::*;
pub use preview::*;
pub use utils::*;
pub use network::*;
pub use streaming::*;
pub use api_settings::*;
pub use settings::*;
pub use sharing::*;
pub use video_metadata::*;
pub use archive::*;
pub use folder_groups::*;

