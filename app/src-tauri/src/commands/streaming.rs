use tauri::State;

/// Holds the per-session streaming config (token + port)
pub struct StreamConfig {
    pub token: String,
    pub port: u16,
}

/// Returned to the frontend so it can construct stream URLs dynamically
#[derive(serde::Serialize)]
pub struct StreamInfo {
    pub token: String,
    pub base_url: String,
}

/// Returns the streaming server's session token and base URL to the frontend.
/// The frontend must use the returned base_url to construct stream URLs,
/// never hardcoding the port.
#[tauri::command]
pub fn cmd_get_stream_info(config: State<'_, StreamConfig>) -> StreamInfo {
    // Match the server's IPv4-only bind address exactly. Using `localhost`
    // can resolve to ::1 first on some machines, leaving the preview request
    // unable to reach a server that is listening only on 127.0.0.1.
    let host = "127.0.0.1";

    StreamInfo {
        token: config.token.clone(),
        base_url: format!("http://{}:{}", host, config.port),
    }
}
