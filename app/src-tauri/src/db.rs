use tauri::{AppHandle, Manager};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use rusqlite::{Connection, params};

pub type DbConnection = Arc<Mutex<Connection>>;

/// Maximum number of retry attempts for database initialization
const MAX_DB_INIT_RETRIES: u32 = 5;

pub fn init_db(app: &AppHandle) -> Result<DbConnection, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let db_path = dir.join("shares.db");
    
    // Retry opening the database with exponential backoff.
    let conn = {
        let mut last_err = String::new();
        let mut opened = None;
        for attempt in 0..MAX_DB_INIT_RETRIES {
            match Connection::open(&db_path) {
                Ok(c) => {
                    let _ = c.execute_batch("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
                    opened = Some(c);
                    break;
                }
                Err(e) => {
                    last_err = e.to_string();
                    if attempt < MAX_DB_INIT_RETRIES - 1 {
                        let wait_ms = 100 * 2u64.pow(attempt);
                        log::warn!(
                            "Failed to open SQLite database (attempt {}/{}): {}. Retrying in {}ms...",
                            attempt + 1, MAX_DB_INIT_RETRIES, last_err, wait_ms
                        );
                        std::thread::sleep(Duration::from_millis(wait_ms));
                    }
                }
            }
        }
        opened.ok_or_else(|| {
            format!(
                "Failed to open SQLite database after {} attempts: {}",
                MAX_DB_INIT_RETRIES, last_err
            )
        })?
    };
    
    // Run migration
    {
        let mut last_err = String::new();
        for attempt in 0..MAX_DB_INIT_RETRIES {
            match conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS shared_links (
                    id TEXT PRIMARY KEY,
                    folder_id INTEGER,
                    message_id INTEGER NOT NULL,
                    file_name TEXT NOT NULL,
                    file_size INTEGER NOT NULL DEFAULT 0,
                    password_hash TEXT,
                    password_salt TEXT,
                    expires_at INTEGER,
                    revoked INTEGER NOT NULL DEFAULT 0,
                    created_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS folder_metadata (
                    channel_id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    username TEXT,
                    is_public INTEGER NOT NULL DEFAULT 0,
                    display_order INTEGER NOT NULL DEFAULT 0,
                    group_id INTEGER,
                    parent_id INTEGER
                );"
            ) {
                Ok(_) => {
                    last_err.clear();
                    break;
                }
                Err(e) => {
                    last_err = e.to_string();
                    if attempt < MAX_DB_INIT_RETRIES - 1 {
                        let wait_ms = 100 * 2u64.pow(attempt);
                        log::warn!(
                            "Failed to run SQLite migration (attempt {}/{}): {}. Retrying in {}ms...",
                            attempt + 1, MAX_DB_INIT_RETRIES, last_err, wait_ms
                        );
                        std::thread::sleep(Duration::from_millis(wait_ms));
                    }
                }
            }
        }
        if !last_err.is_empty() {
            return Err(format!(
                "Failed to run SQLite migration after {} attempts: {}",
                MAX_DB_INIT_RETRIES, last_err
            ));
        }
    }

    // Migration: Ensure parent_id column exists for existing DBs
    let _ = conn.execute("ALTER TABLE folder_metadata ADD COLUMN parent_id INTEGER;", []);

    log::info!("SQLite database initialized successfully using rusqlite.");
    Ok(Arc::new(Mutex::new(conn)))
}

/// Drops existing metadata tables and fully reconstructs the local state from an incoming global cloud manifest
pub fn replace_local_state_from_manifest(conn: &Connection, manifest: &crate::models::GlobalDriveManifest) -> Result<(), String> {
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    tx.execute("DELETE FROM folder_metadata;", []).map_err(|e| e.to_string())?;
    let mut folder_stmt = tx.prepare(
        "INSERT INTO folder_metadata (channel_id, name, username, is_public, display_order, group_id, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?);"
    ).map_err(|e| e.to_string())?;

    for f in &manifest.folders {
        folder_stmt.execute(params![
            f.id,
            f.name.as_str(),
            f.username.as_deref(),
            if f.is_public { 1 } else { 0 },
            f.display_order as i64,
            f.group_id.map(|id| id as i64),
            f.parent_id,
        ]).map_err(|e| e.to_string())?;
    }
    drop(folder_stmt);

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// Serializes current local working groups and folder configurations into a payload ready for the channel pipeline
pub fn export_manifest_from_local_state(conn: &Connection) -> Result<crate::models::GlobalDriveManifest, String> {
    let groups = Vec::new();
    let mut folders = Vec::new();

    let mut f_stmt = conn.prepare("SELECT channel_id, name, username, is_public, display_order, group_id, parent_id FROM folder_metadata;").map_err(|e| e.to_string())?;
    let rows = f_stmt.query_map([], |row| {
        Ok(crate::models::FolderManifestEntry {
            id: row.get(0)?,
            name: row.get(1)?,
            username: row.get(2)?,
            is_public: row.get::<_, i64>(3)? == 1,
            display_order: row.get::<_, i64>(4)? as i32,
            group_id: row.get::<_, Option<i64>>(5)?.map(|id| id as i32),
            parent_id: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?;

    for r in rows {
        if let Ok(entry) = r {
            folders.push(entry);
        }
    }

    Ok(crate::models::GlobalDriveManifest {
        version: 1,
        updated_at: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs(),
        folders,
        groups,
    })
}