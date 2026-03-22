use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize, PtySystem};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex as TokioMutex;
use uuid::Uuid;

use super::shell;

pub struct PtySession {
    pub id: String,
    pub writer: Box<dyn Write + Send>,
    pub master: Arc<TokioMutex<Box<dyn MasterPty + Send>>>,
}

pub struct PtyManager {
    sessions: HashMap<String, PtySession>,
    pty_system: Box<dyn PtySystem + Send>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
            pty_system: native_pty_system(),
        }
    }

    pub async fn spawn_shell(&mut self, cols: u16, rows: u16, app_handle: AppHandle) -> Result<String, String> {
        let session_id = Uuid::now_v7().to_string();

        let pty_pair = self.pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0
            })
            .map_err(|e| e.to_string())?;

        // Detect and spawn platform-appropriate shell
        let shell_path = shell::get_default_shell();
        let mut cmd = CommandBuilder::new(&shell_path);

        // Launch as a login shell to load user's profile and PATH
        #[cfg(not(target_os = "windows"))]
        cmd.arg("-l");

        cmd.env("TERM", "xterm-256color");

        pty_pair.slave
            .spawn_command(cmd)
            .map_err(|e| e.to_string())?;

        // Wrap master in Arc<TokioMutex> to enable shared access
        let master = Arc::new(TokioMutex::new(pty_pair.master));
        let master_for_reader = master.clone();
        let master_for_session = master.clone();

        let session_id_clone = session_id.clone();

        // Clone reader once before spawning the task
        let mut reader = {
            let master_guard = master_for_reader.lock().await;
            master_guard.try_clone_reader().map_err(|e| e.to_string())?
        };

        // Spawn background task to read PTY output and emit to frontend
        tokio::spawn(async move {
            let mut buffer = [0u8; 8192];
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => break, // EOF
                    Ok(n) => {
                        let data: Vec<u8> = buffer[..n].to_vec();
                        let event_name = format!("pty_data_{}", session_id_clone);
                        let _ = app_handle.emit(&event_name, data);
                    }
                    Err(e) => {
                        log::error!("PTY read error: {}", e);
                        break;
                    }
                }
            }
        });

        // Take writer from master
        let writer = {
            let master_guard = master.lock().await;
            master_guard.take_writer().map_err(|e| e.to_string())?
        };

        let session = PtySession {
            id: session_id.clone(),
            writer: Box::new(writer),
            master: master_for_session,
        };

        self.sessions.insert(session_id.clone(), session);
        log::info!("PTY session created: {} (total sessions: {})", session_id, self.sessions.len());
        Ok(session_id)
    }

    pub fn write(&mut self, session_id: &str, data: &[u8]) -> Result<(), String> {
        // Clone session keys to avoid borrow conflicts
        let available_sessions: Vec<String> = self.sessions.keys().cloned().collect();
        log::debug!("Write to session: {} (available sessions: {:?})", session_id, available_sessions);

        let session = self.sessions.get_mut(session_id)
            .ok_or_else(|| format!("Session not found: {} (available: {:?})", session_id, available_sessions))?;

        session.writer.write_all(data)
            .map_err(|e| e.to_string())?;
        session.writer.flush()
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub async fn resize(&mut self, session_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        // Clone session keys to avoid borrow conflicts
        let available_sessions: Vec<String> = self.sessions.keys().cloned().collect();
        log::debug!("Resize session: {} to {}x{} (available sessions: {:?})", session_id, cols, rows, available_sessions);

        let session = self.sessions.get(session_id)
            .ok_or_else(|| format!("Session not found: {} (available: {:?})", session_id, available_sessions))?;

        let new_size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };

        session.master.lock().await
            .resize(new_size)
            .map_err(|e| format!("Failed to resize PTY: {}", e))?;

        Ok(())
    }

    pub fn close(&mut self, session_id: &str) -> Result<(), String> {
        log::info!("Closing PTY session: {} (before: {} sessions)", session_id, self.sessions.len());
        self.sessions.remove(session_id);
        log::info!("Session closed (remaining: {} sessions)", self.sessions.len());
        Ok(())
    }

    pub fn list_sessions(&self) -> Vec<String> {
        self.sessions.keys().cloned().collect()
    }
}
