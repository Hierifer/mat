use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub tmux_enabled: bool,
    pub tmux_scrollback_limit: u32, // 0 = unlimited
    pub auto_restore_sessions: bool,
    pub session_mapping: HashMap<String, String>, // paneId -> tmux session name
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            tmux_enabled: false,
            tmux_scrollback_limit: 0,
            auto_restore_sessions: false,
            session_mapping: HashMap::new(),
        }
    }
}

impl AppSettings {
    /// Get the path to the settings file
    fn get_settings_path() -> Result<PathBuf, String> {
        let app_data_dir = Self::get_app_data_dir()?;

        // Ensure directory exists
        fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create app data directory: {}", e))?;

        Ok(app_data_dir.join("settings.json"))
    }

    /// Get the application data directory
    fn get_app_data_dir() -> Result<PathBuf, String> {
        let dir = if cfg!(target_os = "macos") {
            // macOS: ~/Library/Application Support/mat
            dirs::home_dir()
                .ok_or("Could not find home directory")?
                .join("Library")
                .join("Application Support")
                .join("mat")
        } else if cfg!(target_os = "linux") {
            // Linux: ~/.local/share/mat
            dirs::home_dir()
                .ok_or("Could not find home directory")?
                .join(".local")
                .join("share")
                .join("mat")
        } else if cfg!(target_os = "windows") {
            // Windows: %APPDATA%\mat
            dirs::data_dir()
                .ok_or("Could not find app data directory")?
                .join("mat")
        } else {
            return Err("Unsupported operating system".to_string());
        };

        Ok(dir)
    }

    /// Load settings from disk
    pub fn load() -> Result<Self, String> {
        let settings_path = Self::get_settings_path()?;

        if !settings_path.exists() {
            // No settings file exists, return default
            return Ok(Self::default());
        }

        let content = fs::read_to_string(&settings_path)
            .map_err(|e| format!("Failed to read settings file: {}", e))?;

        let settings: AppSettings = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse settings JSON: {}", e))?;

        Ok(settings)
    }

    /// Save settings to disk
    pub fn save(&self) -> Result<(), String> {
        let settings_path = Self::get_settings_path()?;

        let json = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize settings: {}", e))?;

        fs::write(&settings_path, json)
            .map_err(|e| format!("Failed to write settings file: {}", e))?;

        Ok(())
    }

    /// Update session mapping
    pub fn update_session_mapping(&mut self, pane_id: String, session_name: String) {
        self.session_mapping.insert(pane_id, session_name);
    }

    /// Remove session mapping
    pub fn remove_session_mapping(&mut self, pane_id: &str) {
        self.session_mapping.remove(pane_id);
    }

    /// Get session name for a pane
    pub fn get_session_name(&self, pane_id: &str) -> Option<&String> {
        self.session_mapping.get(pane_id)
    }

    /// Clear all session mappings
    pub fn clear_session_mappings(&mut self) {
        self.session_mapping.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_settings() {
        let settings = AppSettings::default();
        assert!(!settings.tmux_enabled);
        assert_eq!(settings.tmux_scrollback_limit, 0);
        assert!(!settings.auto_restore_sessions);
        assert!(settings.session_mapping.is_empty());
    }

    #[test]
    fn test_session_mapping() {
        let mut settings = AppSettings::default();

        settings.update_session_mapping("pane_1".to_string(), "session_1".to_string());
        assert_eq!(settings.get_session_name("pane_1"), Some(&"session_1".to_string()));

        settings.remove_session_mapping("pane_1");
        assert_eq!(settings.get_session_name("pane_1"), None);
    }

    #[test]
    fn test_get_app_data_dir() {
        let dir = AppSettings::get_app_data_dir().unwrap();
        assert!(dir.to_str().unwrap().contains("mat"));
    }
}
