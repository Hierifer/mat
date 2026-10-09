use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Arc, Mutex as StdMutex};
use tauri::State;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ChatRoom {
    pub id: String,
    pub project_path: String,
    pub branch_name: String,
    pub worktree_path: String,
    pub status: String,
    pub created_at: i64,
    pub merged_at: Option<i64>,
    pub claude_session_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: String,
    pub room_id: String,
    pub kind: String,
    pub text: String,
    pub tool_json: Option<String>,
    pub attachments_json: Option<String>,
    pub timestamp: i64,
}

pub struct StudioDb {
    conn: Connection,
}

impl StudioDb {
    pub fn open(app_data_dir: PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create app data dir: {}", e))?;

        let db_path = app_data_dir.join("studio.db");
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open studio.db: {}", e))?;

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS chat_rooms (
                id TEXT PRIMARY KEY,
                project_path TEXT NOT NULL,
                branch_name TEXT NOT NULL,
                worktree_path TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                created_at INTEGER NOT NULL,
                merged_at INTEGER,
                claude_session_id TEXT
            );

            CREATE TABLE IF NOT EXISTS chat_messages (
                id TEXT PRIMARY KEY,
                room_id TEXT NOT NULL REFERENCES chat_rooms(id),
                kind TEXT NOT NULL,
                text TEXT NOT NULL,
                tool_json TEXT,
                attachments_json TEXT,
                timestamp INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_messages_room
                ON chat_messages(room_id, timestamp);",
        )
        .map_err(|e| format!("Failed to run migrations: {}", e))?;

        // Migration: add claude_session_id column for existing databases
        let _ = conn.execute_batch(
            "ALTER TABLE chat_rooms ADD COLUMN claude_session_id TEXT;",
        );

        Ok(Self { conn })
    }

    pub fn create_room(&self, room: &ChatRoom) -> Result<(), String> {
        self.conn
            .execute(
                "INSERT INTO chat_rooms (id, project_path, branch_name, worktree_path, status, created_at, merged_at, claude_session_id)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    room.id,
                    room.project_path,
                    room.branch_name,
                    room.worktree_path,
                    room.status,
                    room.created_at,
                    room.merged_at,
                    room.claude_session_id,
                ],
            )
            .map_err(|e| format!("Failed to create room: {}", e))?;
        Ok(())
    }

    pub fn get_rooms_for_project(&self, project_path: &str) -> Result<Vec<ChatRoom>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, project_path, branch_name, worktree_path, status, created_at, merged_at, claude_session_id
                 FROM chat_rooms WHERE project_path = ?1 ORDER BY created_at",
            )
            .map_err(|e| format!("Failed to prepare query: {}", e))?;

        let rooms = stmt
            .query_map(params![project_path], |row| {
                Ok(ChatRoom {
                    id: row.get(0)?,
                    project_path: row.get(1)?,
                    branch_name: row.get(2)?,
                    worktree_path: row.get(3)?,
                    status: row.get(4)?,
                    created_at: row.get(5)?,
                    merged_at: row.get(6)?,
                    claude_session_id: row.get(7)?,
                })
            })
            .map_err(|e| format!("Failed to query rooms: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect rooms: {}", e))?;

        Ok(rooms)
    }

    pub fn update_room_status(
        &self,
        room_id: &str,
        status: &str,
        merged_at: Option<i64>,
    ) -> Result<(), String> {
        self.conn
            .execute(
                "UPDATE chat_rooms SET status = ?1, merged_at = ?2 WHERE id = ?3",
                params![status, merged_at, room_id],
            )
            .map_err(|e| format!("Failed to update room status: {}", e))?;
        Ok(())
    }

    pub fn update_claude_session_id(
        &self,
        room_id: &str,
        claude_session_id: &str,
    ) -> Result<(), String> {
        self.conn
            .execute(
                "UPDATE chat_rooms SET claude_session_id = ?1 WHERE id = ?2",
                params![claude_session_id, room_id],
            )
            .map_err(|e| format!("Failed to update claude_session_id: {}", e))?;
        Ok(())
    }

    pub fn delete_room(&self, room_id: &str) -> Result<(), String> {
        self.conn
            .execute(
                "DELETE FROM chat_messages WHERE room_id = ?1",
                params![room_id],
            )
            .map_err(|e| format!("Failed to delete messages: {}", e))?;

        self.conn
            .execute("DELETE FROM chat_rooms WHERE id = ?1", params![room_id])
            .map_err(|e| format!("Failed to delete room: {}", e))?;

        Ok(())
    }

    pub fn add_message(&self, msg: &ChatMessage) -> Result<(), String> {
        self.conn
            .execute(
                "INSERT OR REPLACE INTO chat_messages (id, room_id, kind, text, tool_json, attachments_json, timestamp)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    msg.id,
                    msg.room_id,
                    msg.kind,
                    msg.text,
                    msg.tool_json,
                    msg.attachments_json,
                    msg.timestamp,
                ],
            )
            .map_err(|e| format!("Failed to add message: {}", e))?;
        Ok(())
    }

    pub fn get_messages(&self, room_id: &str) -> Result<Vec<ChatMessage>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, room_id, kind, text, tool_json, attachments_json, timestamp
                 FROM chat_messages WHERE room_id = ?1 ORDER BY timestamp",
            )
            .map_err(|e| format!("Failed to prepare query: {}", e))?;

        let messages = stmt
            .query_map(params![room_id], |row| {
                Ok(ChatMessage {
                    id: row.get(0)?,
                    room_id: row.get(1)?,
                    kind: row.get(2)?,
                    text: row.get(3)?,
                    tool_json: row.get(4)?,
                    attachments_json: row.get(5)?,
                    timestamp: row.get(6)?,
                })
            })
            .map_err(|e| format!("Failed to query messages: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect messages: {}", e))?;

        Ok(messages)
    }
}

// =============================================================================
// Tauri commands
// =============================================================================

#[tauri::command]
pub fn db_create_room(
    db: State<'_, Arc<StdMutex<StudioDb>>>,
    room: ChatRoom,
) -> Result<(), String> {
    let db = db.lock().map_err(|e| format!("DB lock error: {}", e))?;
    db.create_room(&room)
}

#[tauri::command]
pub fn db_get_rooms(
    db: State<'_, Arc<StdMutex<StudioDb>>>,
    project_path: String,
) -> Result<Vec<ChatRoom>, String> {
    let db = db.lock().map_err(|e| format!("DB lock error: {}", e))?;
    db.get_rooms_for_project(&project_path)
}

#[tauri::command]
pub fn db_add_message(
    db: State<'_, Arc<StdMutex<StudioDb>>>,
    message: ChatMessage,
) -> Result<(), String> {
    let db = db.lock().map_err(|e| format!("DB lock error: {}", e))?;
    db.add_message(&message)
}

#[tauri::command]
pub fn db_get_messages(
    db: State<'_, Arc<StdMutex<StudioDb>>>,
    room_id: String,
) -> Result<Vec<ChatMessage>, String> {
    let db = db.lock().map_err(|e| format!("DB lock error: {}", e))?;
    db.get_messages(&room_id)
}

#[tauri::command]
pub fn db_update_room_status(
    db: State<'_, Arc<StdMutex<StudioDb>>>,
    room_id: String,
    status: String,
    merged_at: Option<i64>,
) -> Result<(), String> {
    let db = db.lock().map_err(|e| format!("DB lock error: {}", e))?;
    db.update_room_status(&room_id, &status, merged_at)
}

#[tauri::command]
pub fn db_update_claude_session_id(
    db: State<'_, Arc<StdMutex<StudioDb>>>,
    room_id: String,
    claude_session_id: String,
) -> Result<(), String> {
    let db = db.lock().map_err(|e| format!("DB lock error: {}", e))?;
    db.update_claude_session_id(&room_id, &claude_session_id)
}

#[tauri::command]
pub fn db_delete_room(
    db: State<'_, Arc<StdMutex<StudioDb>>>,
    room_id: String,
) -> Result<(), String> {
    let db = db.lock().map_err(|e| format!("DB lock error: {}", e))?;
    db.delete_room(&room_id)
}
