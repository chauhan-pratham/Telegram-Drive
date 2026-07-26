use serde::Serialize;
use tauri::State;
use rand::Rng;
use crate::db::DbConnection;
use rusqlite::params;

#[derive(Debug, Serialize)]
pub struct ShareInfo {
    pub id: String,
    pub folder_id: Option<i64>,
    pub message_id: i32,
    pub file_name: String,
    pub file_size: i64,
    pub created_at: i64,
    pub expires_at: Option<i64>,
    pub has_password: bool,
    pub link: String,
}

fn generate_share_token() -> String {
    let mut rng = rand::rng();
    let bytes: Vec<u8> = (0..16).map(|_| rng.random()).collect();
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

fn hash_password(password: &str) -> Result<String, String> {
    bcrypt::hash(password, 12).map_err(|e| format!("Password hashing failed: {}", e))
}

#[tauri::command]
pub async fn cmd_create_share(
    folder_id: Option<i64>,
    message_id: i32,
    file_name: String,
    file_size: i64,
    password: Option<String>,
    expiry_hours: Option<i64>,
    db_pool: State<'_, DbConnection>,
) -> Result<ShareInfo, String> {
    let token = generate_share_token();
    let created_at = chrono::Utc::now().timestamp();
    let expires_at = expiry_hours.map(|hours| created_at + hours * 3600);
    
    let password_hash = if let Some(ref pwd) = password {
        if pwd.is_empty() {
            None
        } else {
            let hash = hash_password(pwd)?;
            Some(hash)
        }
    } else {
        None
    };

    let conn = db_pool.lock().map_err(|e| e.to_string())?;
    
    conn.execute(
        "INSERT INTO shared_links (id, folder_id, message_id, file_name, file_size, password_hash, password_salt, expires_at, revoked, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)",
        params![
            token.as_str(),
            folder_id,
            message_id as i64,
            file_name.as_str(),
            file_size,
            password_hash.as_deref(),
            None::<&str>,
            expires_at,
            created_at,
        ]
    ).map_err(|e| e.to_string())?;

    let link = format!("http://127.0.0.1:{}/d/{}", crate::STREAM_PORT, token);

    Ok(ShareInfo {
        id: token,
        folder_id,
        message_id,
        file_name,
        file_size,
        created_at,
        expires_at,
        has_password: password_hash.is_some(),
        link,
    })
}

#[tauri::command]
pub async fn cmd_list_shares(
    db_pool: State<'_, DbConnection>,
) -> Result<Vec<ShareInfo>, String> {
    let conn = db_pool.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, folder_id, message_id, file_name, file_size, password_hash, expires_at, created_at 
             FROM shared_links WHERE revoked = 0 ORDER BY created_at DESC"
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |row| {
        let id: String = row.get(0)?;
        let folder_id: Option<i64> = row.get(1)?;
        let message_id: i64 = row.get(2)?;
        let file_name: String = row.get(3)?;
        let file_size: i64 = row.get(4)?;
        let password_hash: Option<String> = row.get(5)?;
        let expires_at: Option<i64> = row.get(6)?;
        let created_at: i64 = row.get(7)?;

        let link = format!("http://127.0.0.1:{}/d/{}", crate::STREAM_PORT, id);

        Ok(ShareInfo {
            id,
            folder_id,
            message_id: message_id as i32,
            file_name,
            file_size,
            created_at,
            expires_at,
            has_password: password_hash.is_some(),
            link,
        })
    }).map_err(|e| e.to_string())?;

    let mut shares = Vec::new();
    for r in rows {
        if let Ok(s) = r {
            shares.push(s);
        }
    }
    
    Ok(shares)
}

#[tauri::command]
pub async fn cmd_revoke_share(
    id: String,
    db_pool: State<'_, DbConnection>,
) -> Result<(), String> {
    let conn = db_pool.lock().map_err(|e| e.to_string())?;
    conn.execute("UPDATE shared_links SET revoked = 1 WHERE id = ?", params![id.as_str()]).map_err(|e| e.to_string())?;
    Ok(())
}
