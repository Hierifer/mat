use tauri::{command, AppHandle, State};
use std::sync::Arc;
use tokio::sync::Mutex;
use super::manager::PtyManager;
use serde::Serialize;

#[derive(Serialize)]
pub struct PtySpawnResponse {
    pub session_id: String,
    pub cwd: String,
}

#[command]
pub async fn pty_spawn(
    manager: State<'_, Arc<Mutex<PtyManager>>>,
    app_handle: AppHandle,
    cols: u16,
    rows: u16,
) -> Result<PtySpawnResponse, String> {
    let session_id = manager.lock().await.spawn_shell(cols, rows, app_handle).await?;

    // Get user's home directory as the initial cwd
    let cwd = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE")) // Windows fallback
        .unwrap_or_else(|_| "~".to_string());

    Ok(PtySpawnResponse {
        session_id,
        cwd,
    })
}

#[command]
pub async fn pty_write(
    manager: State<'_, Arc<Mutex<PtyManager>>>,
    session_id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    manager.lock().await.write(&session_id, &data)
}

#[command]
pub async fn pty_resize(
    manager: State<'_, Arc<Mutex<PtyManager>>>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    manager.lock().await.resize(&session_id, cols, rows).await
}

#[command]
pub async fn pty_close(
    manager: State<'_, Arc<Mutex<PtyManager>>>,
    session_id: String,
) -> Result<(), String> {
    manager.lock().await.close(&session_id)
}
