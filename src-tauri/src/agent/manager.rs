use std::collections::HashMap;
use std::process::Stdio;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use uuid::Uuid;

/// A running Claude Code headless agent process (stream-json mode).
pub struct AgentSession {
    child: Child,
    stdin: ChildStdin,
}

#[derive(Default)]
pub struct AgentManager {
    sessions: HashMap<String, AgentSession>,
}

impl AgentManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// Spawn a headless Claude Code process in `cwd`.
    /// Emits `agent_event_{id}` for each stdout JSON line,
    /// `agent_stderr_{id}` for stderr lines, and `agent_exit_{id}` on exit.
    pub fn spawn(&mut self, cwd: String, app: AppHandle) -> Result<String, String> {
        if !std::path::Path::new(&cwd).is_dir() {
            return Err(format!("Directory does not exist: {}", cwd));
        }

        let agent_id = Uuid::now_v7().to_string();

        // Run via a login shell so the user's PATH (nvm/homebrew etc.) is inherited;
        // GUI apps on macOS otherwise have a minimal PATH without `claude`.
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        let claude_cmd = "claude -p --input-format stream-json --output-format stream-json --verbose --dangerously-skip-permissions";

        let mut child = Command::new(&shell)
            .args(["-lc", claude_cmd])
            .current_dir(&cwd)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| format!("Failed to spawn agent: {}", e))?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Failed to open agent stdin".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Failed to open agent stdout".to_string())?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| "Failed to open agent stderr".to_string())?;

        // Stream stdout JSON lines to frontend
        {
            let app = app.clone();
            let event_name = format!("agent_event_{}", agent_id);
            tokio::spawn(async move {
                let mut lines = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    if line.trim().is_empty() {
                        continue;
                    }
                    let _ = app.emit(&event_name, line);
                }
            });
        }

        // Stream stderr lines to frontend (for diagnostics)
        {
            let app = app.clone();
            let event_name = format!("agent_stderr_{}", agent_id);
            tokio::spawn(async move {
                let mut lines = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    if line.trim().is_empty() {
                        continue;
                    }
                    let _ = app.emit(&event_name, line);
                }
            });
        }

        self.sessions.insert(agent_id.clone(), AgentSession { child, stdin });

        Ok(agent_id)
    }

    /// Send a user message (plain text) to the agent as a stream-json line.
    pub async fn send(&mut self, agent_id: &str, text: &str) -> Result<(), String> {
        let session = self
            .sessions
            .get_mut(agent_id)
            .ok_or_else(|| format!("Agent not found: {}", agent_id))?;

        let msg = serde_json::json!({
            "type": "user",
            "message": {
                "role": "user",
                "content": [{ "type": "text", "text": text }]
            }
        });
        let mut line = msg.to_string();
        line.push('\n');

        session
            .stdin
            .write_all(line.as_bytes())
            .await
            .map_err(|e| format!("Failed to write to agent stdin: {}", e))?;
        session
            .stdin
            .flush()
            .await
            .map_err(|e| format!("Failed to flush agent stdin: {}", e))?;
        Ok(())
    }

    /// Kill an agent process and remove it.
    pub async fn kill(&mut self, agent_id: &str) -> Result<(), String> {
        if let Some(mut session) = self.sessions.remove(agent_id) {
            let _ = session.child.kill().await;
        }
        Ok(())
    }

    /// Non-blocking exit check. Returns Ok(Some(code)) once the process has exited,
    /// Ok(None) while still running, Err if the session no longer exists.
    pub fn try_wait(&mut self, agent_id: &str) -> Result<Option<i32>, String> {
        let session = self
            .sessions
            .get_mut(agent_id)
            .ok_or_else(|| format!("Agent not found: {}", agent_id))?;
        match session.child.try_wait() {
            Ok(Some(status)) => Ok(Some(status.code().unwrap_or(-1))),
            Ok(None) => Ok(None),
            Err(e) => Err(format!("try_wait failed: {}", e)),
        }
    }

    pub fn remove(&mut self, agent_id: &str) {
        self.sessions.remove(agent_id);
    }
}
