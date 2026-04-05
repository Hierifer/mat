// Stub implementation for non-macOS platforms
// These platforms should use Web Speech API on the frontend

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpeechRecognitionResult {
    pub text: String,
    pub is_final: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpeechRecognitionError {
    pub error: String,
    pub message: String,
}

#[tauri::command]
pub async fn speech_check_availability() -> Result<bool, String> {
    // On non-macOS platforms, return false to indicate
    // that native speech recognition is not available
    // Frontend should use Web Speech API instead
    Ok(false)
}

#[tauri::command]
pub async fn speech_start_recognition(
    _app: tauri::AppHandle,
    _language: Option<String>,
) -> Result<(), String> {
    Err("Native speech recognition not available on this platform. Use Web Speech API.".to_string())
}

#[tauri::command]
pub async fn speech_stop_recognition() -> Result<(), String> {
    Err("Native speech recognition not available on this platform".to_string())
}

#[tauri::command]
pub async fn speech_is_listening() -> Result<bool, String> {
    Ok(false)
}
