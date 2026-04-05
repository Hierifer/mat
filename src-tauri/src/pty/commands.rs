use tauri::{command, AppHandle, State};
use std::sync::Arc;
use tokio::sync::Mutex;
use super::manager::PtyManager;
use super::tmux::{TmuxManager, TmuxSessionInfo};
use crate::settings::AppSettings;
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
    tmux_enabled: Option<bool>,
    tmux_session_name: Option<String>,
) -> Result<PtySpawnResponse, String> {
    let tmux_enabled = tmux_enabled.unwrap_or(false);
    let session_id = manager
        .lock()
        .await
        .spawn_shell(cols, rows, app_handle, tmux_enabled, tmux_session_name)
        .await?;

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

#[command]
pub async fn pty_list_sessions(
    manager: State<'_, Arc<Mutex<PtyManager>>>,
) -> Result<Vec<String>, String> {
    Ok(manager.lock().await.list_sessions())
}

// ============================================================================
// tmux Commands
// ============================================================================

#[command]
pub async fn tmux_list_sessions() -> Result<Vec<TmuxSessionInfo>, String> {
    TmuxManager::list_sessions()
}

#[command]
pub async fn tmux_attach_session(
    manager: State<'_, Arc<Mutex<PtyManager>>>,
    app_handle: AppHandle,
    name: String,
    cols: u16,
    rows: u16,
) -> Result<PtySpawnResponse, String> {
    // Check if session exists
    if !TmuxManager::session_exists(&name).unwrap_or(false) {
        return Err(format!("tmux session '{}' does not exist", name));
    }

    // Spawn PTY with tmux session
    let session_id = manager
        .lock()
        .await
        .spawn_shell(cols, rows, app_handle, true, Some(name.clone()))
        .await?;

    let cwd = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| "~".to_string());

    Ok(PtySpawnResponse {
        session_id,
        cwd,
    })
}

#[command]
pub async fn tmux_kill_session(name: String) -> Result<(), String> {
    TmuxManager::kill_session(&name)
}

#[command]
pub async fn tmux_rename_session(old_name: String, new_name: String) -> Result<(), String> {
    TmuxManager::rename_session(&old_name, &new_name)
}

#[command]
pub async fn tmux_get_history(
    session_name: String,
    pane: Option<u32>,
    lines: usize,
) -> Result<Vec<String>, String> {
    let pane_id = pane.unwrap_or(0);
    TmuxManager::get_history(&session_name, pane_id, lines)
}

#[command]
pub async fn tmux_search_history(
    session_name: String,
    pane: Option<u32>,
    pattern: String,
) -> Result<Vec<String>, String> {
    let pane_id = pane.unwrap_or(0);
    TmuxManager::search_history(&session_name, pane_id, &pattern)
}

#[command]
pub async fn tmux_export_history(
    session_name: String,
    pane: Option<u32>,
    file_path: String,
) -> Result<(), String> {
    let pane_id = pane.unwrap_or(0);
    TmuxManager::export_history(&session_name, pane_id, &file_path)
}

#[command]
pub async fn tmux_check_installed() -> Result<bool, String> {
    match TmuxManager::detect_tmux() {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

#[command]
pub async fn tmux_get_version() -> Result<String, String> {
    TmuxManager::check_version()
}

// ============================================================================
// Settings Commands
// ============================================================================

#[command]
pub async fn settings_get() -> Result<AppSettings, String> {
    AppSettings::load()
}

#[command]
pub async fn settings_update(settings: AppSettings) -> Result<(), String> {
    settings.save()
}
