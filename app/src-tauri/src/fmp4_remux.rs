use actix_web::web;
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct Fmp4RemuxState {
    pub dummy: Arc<Mutex<u32>>,
}

impl Fmp4RemuxState {
    pub fn new() -> Self {
        Self { dummy: Arc::new(Mutex::new(0)) }
    }
}

pub fn configure_fmp4_routes(_cfg: &mut web::ServiceConfig) {
    // fMP4 routes setup
}
