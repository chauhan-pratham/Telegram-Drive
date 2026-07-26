use tauri::State;
use crate::db::DbConnection;
use crate::models::FolderMetadata;
use rusqlite::{Connection, params};

#[tauri::command]
pub async fn cmd_get_enriched_folders(
    db_pool: State<'_, DbConnection>,
) -> Result<Vec<FolderMetadata>, String> {
    let conn = db_pool.lock().map_err(|e| e.to_string())?;
    
    let query = "
        SELECT channel_id, name, username, is_public, display_order, group_id 
        FROM folder_metadata 
        ORDER BY display_order ASC
    ";
    
    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        let channel_id: i64 = row.get(0)?;
        let name: String = row.get(1)?;
        let username: Option<String> = row.get(2)?;
        let is_public: i64 = row.get(3)?;
        let display_order: i64 = row.get(4)?;
        let group_id: Option<i64> = row.get(5)?;

        Ok(FolderMetadata {
            id: channel_id,
            parent_id: None,
            name,
            username,
            is_public: is_public != 0,
            is_owned: true,
            group_id: group_id.map(|id| id as i32),
            display_order: display_order as i32,
            participants_count: None,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut folders = Vec::new();
    for r in rows {
        if let Ok(f) = r {
            folders.push(f);
        }
    }
    
    Ok(folders)
}

#[tauri::command]
pub async fn cmd_update_folder_order(
    channel_id: i64,
    new_order: i32,
    db_pool: State<'_, DbConnection>,
) -> Result<(), String> {
    let conn = db_pool.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE folder_metadata SET display_order = ? WHERE channel_id = ?",
        params![new_order as i64, channel_id]
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_enriched_folders_internal(
    conn: &Connection,
    raw_folders: Vec<FolderMetadata>,
) -> Result<Vec<FolderMetadata>, String> {
    // 1. Fetch local folder metadata (group_id, display_order)
    let mut stmt = conn
        .prepare("SELECT channel_id, display_order, group_id FROM folder_metadata")
        .map_err(|e| e.to_string())?;
        
    let mut local_map = std::collections::HashMap::new();
    let rows = stmt.query_map([], |row| {
        let channel_id: i64 = row.get(0)?;
        let display_order: i64 = row.get(1)?;
        let group_id: Option<i64> = row.get(2)?;
        Ok((channel_id, (display_order as i32, group_id.map(|id| id as i32))))
    }).map_err(|e| e.to_string())?;

    for r in rows {
        if let Ok((cid, data)) = r {
            local_map.insert(cid, data);
        }
    }
    
    // 2. Perform merge & upsert
    let mut enriched = Vec::new();
    let mut max_order = local_map.values().map(|(o, _)| *o).max().unwrap_or(0);
    
    for mut folder in raw_folders {
        if let Some(&(order, group_id)) = local_map.get(&folder.id) {
            folder.display_order = order;
            folder.group_id = group_id;
            
            conn.execute(
                "UPDATE folder_metadata SET name = ?, username = ?, is_public = ? WHERE channel_id = ?",
                params![
                    folder.name.as_str(),
                    folder.username.as_deref(),
                    if folder.is_public { 1 } else { 0 },
                    folder.id
                ]
            ).map_err(|e| e.to_string())?;
        } else {
            max_order += 1;
            folder.display_order = max_order;
            folder.group_id = None;
            
            conn.execute(
                "INSERT INTO folder_metadata (channel_id, name, username, is_public, display_order, group_id) VALUES (?, ?, ?, ?, ?, NULL)",
                params![
                    folder.id,
                    folder.name.as_str(),
                    folder.username.as_deref(),
                    if folder.is_public { 1 } else { 0 },
                    max_order as i64
                ]
            ).map_err(|e| e.to_string())?;
        }
        enriched.push(folder);
    }
    
    // 3. Prune folders that are no longer on Telegram
    let enriched_ids: std::collections::HashSet<i64> = enriched.iter().map(|f| f.id).collect();
    for id in local_map.keys() {
        if !enriched_ids.contains(id) {
            conn.execute("DELETE FROM folder_metadata WHERE channel_id = ?", params![*id]).map_err(|e| e.to_string())?;
        }
    }
    
    // 4. Sort enriched folders by display_order
    enriched.sort_by_key(|f| f.display_order);
    
    Ok(enriched)
}
