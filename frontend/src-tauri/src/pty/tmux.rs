use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TmuxSessionInfo {
    pub name: String,
    pub attached: bool,
    pub created: u64,
    pub windows: u32,
}

pub struct TmuxManager;

impl TmuxManager {
    /// Detect if tmux is installed and return its path
    pub fn detect_tmux() -> Result<PathBuf, String> {
        let tmux_path = if cfg!(target_os = "windows") {
            // On Windows, check in WSL
            PathBuf::from("wsl")
        } else {
            // Try to find tmux in PATH
            which::which("tmux").map_err(|_| "tmux not found in PATH".to_string())?
        };

        // Verify tmux is executable by checking version
        let output = Command::new(&tmux_path)
            .arg("-V")
            .output()
            .map_err(|e| format!("Failed to execute tmux: {}", e))?;

        if !output.status.success() {
            return Err("tmux command failed".to_string());
        }

        let version = String::from_utf8_lossy(&output.stdout);
        if !version.contains("tmux") {
            return Err("Invalid tmux version output".to_string());
        }

        Ok(tmux_path)
    }

    /// Check tmux version and ensure it's >= 2.0
    pub fn check_version() -> Result<String, String> {
        let output = Command::new("tmux")
            .arg("-V")
            .output()
            .map_err(|e| format!("Failed to check tmux version: {}", e))?;

        let version_str = String::from_utf8_lossy(&output.stdout);

        // Extract version number (e.g., "tmux 3.2a" -> "3.2")
        let re = Regex::new(r"tmux (\d+)\.(\d+)").unwrap();
        if let Some(caps) = re.captures(&version_str) {
            let major: u32 = caps[1].parse().unwrap_or(0);
            if major < 2 {
                return Err(format!("tmux version {} is too old. Requires >= 2.0", version_str.trim()));
            }
            return Ok(version_str.trim().to_string());
        }

        Err("Could not parse tmux version".to_string())
    }

    /// Generate unique session name with pattern: mat_{timestamp}_{random}
    pub fn generate_session_name() -> String {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let random = uuid::Uuid::new_v4().to_string().split('-').next().unwrap().to_string();
        format!("mat_{}_{}", timestamp, random)
    }

    /// Create a new tmux session
    pub fn create_session(name: &str, shell: &str, cwd: Option<&str>) -> Result<(), String> {
        let mut cmd = Command::new("tmux");
        cmd.args(&["new-session", "-d", "-s", name]);

        // Set working directory if provided
        if let Some(dir) = cwd {
            cmd.args(&["-c", dir]);
        }

        // Spawn the specified shell
        cmd.arg(shell);

        let output = cmd.output()
            .map_err(|e| format!("Failed to create tmux session: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);

            // Check for duplicate session error
            if stderr.contains("duplicate session") {
                return Err("Session name already exists".to_string());
            }

            return Err(format!("tmux new-session failed: {}", stderr));
        }

        // Configure session options
        Self::configure_session(name)?;

        Ok(())
    }

    /// Configure tmux session with desired options
    fn configure_session(name: &str) -> Result<(), String> {
        // Set unlimited history
        Self::run_tmux_command(&["set-option", "-t", name, "history-limit", "0"])?;

        // Hide status bar for cleaner UI
        Self::run_tmux_command(&["set-option", "-t", name, "status", "off"])?;

        // Enable mouse support
        Self::run_tmux_command(&["set-option", "-t", name, "mouse", "on"])?;

        // Disable escape time for better responsiveness
        Self::run_tmux_command(&["set-option", "-t", name, "escape-time", "0"])?;

        Ok(())
    }

    /// Helper to run tmux commands
    fn run_tmux_command(args: &[&str]) -> Result<(), String> {
        let output = Command::new("tmux")
            .args(args)
            .output()
            .map_err(|e| format!("Failed to run tmux command: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("tmux command failed: {}", stderr));
        }

        Ok(())
    }

    /// List all tmux sessions
    pub fn list_sessions() -> Result<Vec<TmuxSessionInfo>, String> {
        let output = Command::new("tmux")
            .args(&["list-sessions", "-F", "#{session_name}|#{session_attached}|#{session_created}|#{session_windows}"])
            .output()
            .map_err(|e| format!("Failed to list tmux sessions: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);

            // No sessions is not an error
            if stderr.contains("no server running") || stderr.contains("no sessions") {
                return Ok(Vec::new());
            }

            return Err(format!("tmux list-sessions failed: {}", stderr));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut sessions = Vec::new();

        for line in stdout.lines() {
            let parts: Vec<&str> = line.split('|').collect();
            if parts.len() >= 4 {
                sessions.push(TmuxSessionInfo {
                    name: parts[0].to_string(),
                    attached: parts[1] == "1",
                    created: parts[2].parse().unwrap_or(0),
                    windows: parts[3].parse().unwrap_or(1),
                });
            }
        }

        Ok(sessions)
    }

    /// Check if a session exists
    pub fn session_exists(name: &str) -> Result<bool, String> {
        let output = Command::new("tmux")
            .args(&["has-session", "-t", name])
            .output()
            .map_err(|e| format!("Failed to check session: {}", e))?;

        Ok(output.status.success())
    }

    /// Get the command to attach to a tmux session
    /// Returns the shell command that should be spawned via PTY
    pub fn get_attach_command(name: &str) -> String {
        format!("tmux attach-session -t {}", name)
    }

    /// Kill (terminate) a tmux session
    pub fn kill_session(name: &str) -> Result<(), String> {
        let output = Command::new("tmux")
            .args(&["kill-session", "-t", name])
            .output()
            .map_err(|e| format!("Failed to kill tmux session: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("tmux kill-session failed: {}", stderr));
        }

        Ok(())
    }

    /// Rename a tmux session
    pub fn rename_session(old_name: &str, new_name: &str) -> Result<(), String> {
        let output = Command::new("tmux")
            .args(&["rename-session", "-t", old_name, new_name])
            .output()
            .map_err(|e| format!("Failed to rename tmux session: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("tmux rename-session failed: {}", stderr));
        }

        Ok(())
    }

    /// Get history from a tmux pane
    pub fn get_history(session_name: &str, pane: u32, lines: usize) -> Result<Vec<String>, String> {
        let target = format!("{}:{}", session_name, pane);

        let output = Command::new("tmux")
            .args(&[
                "capture-pane",
                "-t", &target,
                "-p",
                "-S", &format!("-{}", lines),
            ])
            .output()
            .map_err(|e| format!("Failed to capture tmux pane: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("tmux capture-pane failed: {}", stderr));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(stdout.lines().map(|s| s.to_string()).collect())
    }

    /// Check if session has active clients attached
    pub fn is_session_attached(name: &str) -> Result<bool, String> {
        let output = Command::new("tmux")
            .args(&["list-clients", "-t", name])
            .output()
            .map_err(|e| format!("Failed to list tmux clients: {}", e))?;

        Ok(output.status.success() && !output.stdout.is_empty())
    }

    /// Export full session history to a file
    pub fn export_history(session_name: &str, pane: u32, file_path: &str) -> Result<(), String> {
        let target = format!("{}:{}", session_name, pane);

        // Capture entire scrollback (-S - means from the beginning)
        let output = Command::new("tmux")
            .args(&[
                "capture-pane",
                "-t", &target,
                "-p",
                "-S", "-",
            ])
            .output()
            .map_err(|e| format!("Failed to capture tmux pane: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("tmux capture-pane failed: {}", stderr));
        }

        // Write to file
        std::fs::write(file_path, output.stdout)
            .map_err(|e| format!("Failed to write history to file: {}", e))?;

        Ok(())
    }

    /// Search history for a pattern
    pub fn search_history(session_name: &str, pane: u32, pattern: &str) -> Result<Vec<String>, String> {
        let history = Self::get_history(session_name, pane, 10000)?;

        let re = Regex::new(pattern)
            .map_err(|e| format!("Invalid regex pattern: {}", e))?;

        let matches: Vec<String> = history
            .into_iter()
            .filter(|line| re.is_match(line))
            .collect();

        Ok(matches)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_session_name() {
        let name = TmuxManager::generate_session_name();
        assert!(name.starts_with("mat_"));
        assert!(name.len() > 10);
    }

    #[test]
    fn test_detect_tmux() {
        // This test will fail if tmux is not installed
        match TmuxManager::detect_tmux() {
            Ok(path) => {
                assert!(path.to_str().unwrap().contains("tmux") || path.to_str().unwrap().contains("wsl"));
            }
            Err(e) => {
                println!("tmux not detected (expected if not installed): {}", e);
            }
        }
    }
}
