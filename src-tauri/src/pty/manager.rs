use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize, PtySystem};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex as TokioMutex;
use uuid::Uuid;

use super::shell;
use super::tmux::TmuxManager;

pub struct PtySession {
    pub id: String,
    pub writer: Box<dyn Write + Send>,
    pub master: Arc<TokioMutex<Box<dyn MasterPty + Send>>>,
    pub tmux_session_name: Option<String>,  // tmux session name if tmux is enabled
    pub tmux_enabled: bool,                  // whether this session uses tmux
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

    pub async fn spawn_shell(
        &mut self,
        cols: u16,
        rows: u16,
        app_handle: AppHandle,
        tmux_enabled: bool,
        tmux_session_name: Option<String>,
        cwd: Option<String>,
    ) -> Result<(String, Option<String>), String> {
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

        // Prepare tmux session name if tmux is enabled
        let tmux_session = if tmux_enabled {
            // Use provided name or generate a new one
            let session_name = tmux_session_name.unwrap_or_else(|| TmuxManager::generate_session_name());

            // Create tmux session if it doesn't exist
            if !TmuxManager::session_exists(&session_name).unwrap_or(false) {
                let shell_str = shell_path.to_str().ok_or("Invalid shell path")?;
                TmuxManager::create_session(&session_name, shell_str, cwd.as_deref())?;
                log::info!("Created new tmux session: {}", session_name);
            } else {
                log::info!("Attaching to existing tmux session: {}", session_name);
            }

            // Set command to attach to tmux session instead of direct shell
            cmd = CommandBuilder::new("tmux");
            cmd.args(&["attach-session", "-t", &session_name]);

            Some(session_name)
        } else {
            // Standard non-tmux mode
            #[cfg(not(target_os = "windows"))]
            cmd.arg("-l");

            None
        };

        cmd.env("TERM", "xterm-256color");
        cmd.env("TERM_PROGRAM", "Materm");

        // Shell integration: inject OSC 7 (directory tracking) hooks
        if !tmux_enabled {
            let shell_name = shell_path.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("");

            if shell_name.contains("zsh") {
                Self::setup_zsh_integration(&mut cmd);
            } else if shell_name.contains("bash") {
                Self::setup_bash_integration(&mut cmd);
            }
        }

        // Set initial working directory if provided
        if let Some(ref dir) = cwd {
            let path = std::path::Path::new(dir);
            if path.is_dir() {
                cmd.cwd(path);
            }
        }

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
            tmux_session_name: tmux_session.clone(),
            tmux_enabled,
        };

        self.sessions.insert(session_id.clone(), session);

        if tmux_enabled {
            log::info!(
                "PTY session created with tmux: {} -> {} (total sessions: {})",
                session_id,
                tmux_session.clone().unwrap_or_default(),
                self.sessions.len()
            );
        } else {
            log::info!("PTY session created: {} (total sessions: {})", session_id, self.sessions.len());
        }

        Ok((session_id, tmux_session))
    }

    /// Set up zsh shell integration via ZDOTDIR override.
    /// Creates a temp directory with .zshenv/.zshrc that source the user's
    /// original config and then add OSC 7 directory-tracking hooks.
    fn setup_zsh_integration(cmd: &mut CommandBuilder) {
        let integration_dir = std::env::temp_dir().join("materm_shell_integration").join("zsh");
        if std::fs::create_dir_all(&integration_dir).is_err() {
            return;
        }

        let zshenv = r#"# Materm shell integration – .zshenv
_MATERM_USER_ZDOTDIR="${_MATERM_ORIG_ZDOTDIR:-$HOME}"
[[ -f "$_MATERM_USER_ZDOTDIR/.zshenv" ]] && source "$_MATERM_USER_ZDOTDIR/.zshenv"
"#;

        let zprofile = r#"# Materm shell integration – .zprofile
[[ -f "$_MATERM_USER_ZDOTDIR/.zprofile" ]] && source "$_MATERM_USER_ZDOTDIR/.zprofile"
"#;

        let zshrc = r#"# Materm shell integration – .zshrc
[[ -f "$_MATERM_USER_ZDOTDIR/.zshrc" ]] && source "$_MATERM_USER_ZDOTDIR/.zshrc"

# Restore ZDOTDIR so new shells / subshells behave normally
ZDOTDIR="$_MATERM_USER_ZDOTDIR"

# OSC 7: report current working directory to the terminal
_materm_report_cwd() {
    printf '\e]7;file://%s%s\a' "$HOST" "$PWD"
}
chpwd_functions+=(_materm_report_cwd)
precmd_functions+=(_materm_report_cwd)
"#;

        let zlogin = r#"# Materm shell integration – .zlogin
[[ -f "$_MATERM_USER_ZDOTDIR/.zlogin" ]] && source "$_MATERM_USER_ZDOTDIR/.zlogin"
"#;

        // Write all integration files (ignore errors – fall back to no integration)
        let _ = std::fs::write(integration_dir.join(".zshenv"), zshenv);
        let _ = std::fs::write(integration_dir.join(".zprofile"), zprofile);
        let _ = std::fs::write(integration_dir.join(".zshrc"), zshrc);
        let _ = std::fs::write(integration_dir.join(".zlogin"), zlogin);

        // Preserve the user's original ZDOTDIR (if any) and point to ours
        let orig = std::env::var("ZDOTDIR").unwrap_or_default();
        cmd.env("_MATERM_ORIG_ZDOTDIR", &orig);
        if let Some(dir_str) = integration_dir.to_str() {
            cmd.env("ZDOTDIR", dir_str);
        }
    }

    /// Set up bash shell integration via PROMPT_COMMAND.
    fn setup_bash_integration(cmd: &mut CommandBuilder) {
        let osc7 = r#"printf '\e]7;file://%s%s\a' "$HOSTNAME" "$PWD""#;
        cmd.env("MATERM_PROMPT_COMMAND", osc7);
        // We set MATERM_PROMPT_COMMAND; the user's .bashrc may override PROMPT_COMMAND,
        // so we append via ENV which bash sources for non-interactive, and rely on
        // PROMPT_COMMAND for interactive. A pragmatic fallback.
        let combined = format!(
            r#"{osc7}${{PROMPT_COMMAND:+;$PROMPT_COMMAND}}"#,
            osc7 = osc7
        );
        cmd.env("PROMPT_COMMAND", &combined);
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

    pub fn close(&mut self, session_id: &str, kill_tmux: bool) -> Result<(), String> {
        log::info!("Closing PTY session: {} (before: {} sessions)", session_id, self.sessions.len());
        if kill_tmux {
            if let Some(session) = self.sessions.get(session_id) {
                if session.tmux_enabled {
                    if let Some(name) = &session.tmux_session_name {
                        match TmuxManager::kill_session(name) {
                            Ok(()) => log::info!("Killed tmux session: {}", name),
                            Err(e) => log::warn!("Failed to kill tmux session {}: {}", name, e),
                        }
                    }
                }
            }
        }
        self.sessions.remove(session_id);
        log::info!("Session closed (remaining: {} sessions)", self.sessions.len());
        Ok(())
    }

    pub fn list_sessions(&self) -> Vec<String> {
        self.sessions.keys().cloned().collect()
    }
}
