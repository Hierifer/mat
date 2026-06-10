// Speech recognition module
// Supports Whisper (local) and DashScope Paraformer providers

pub mod audio;
pub mod whisper;
pub mod alibaba;

use crate::settings::AppSettings;

pub use whisper::{
    speech_check_availability, __cmd__speech_check_availability,
    speech_check_permission, __cmd__speech_check_permission,
    speech_request_permission, __cmd__speech_request_permission,
    speech_list_devices, __cmd__speech_list_devices,
    speech_test_microphone, __cmd__speech_test_microphone,
};

/// Start speech recognition with the specified provider
#[tauri::command]
pub async fn speech_start_recognition(
    app: tauri::AppHandle,
    language: Option<String>,
    provider: Option<String>,
) -> Result<(), String> {
    // Check microphone permission first
    println!("[Speech] Checking microphone permission...");
    match speech_check_permission().await {
        Ok(true) => {
            println!("[Speech] Microphone permission granted");
        }
        Ok(false) => {
            println!("[Speech] Requesting microphone permission...");
            match speech_request_permission().await {
                Ok(true) => {
                    println!("[Speech] Microphone permission granted after request");
                }
                Ok(false) => {
                    return Err("麦克风权限被拒绝。请在系统设置 > 隐私与安全性 > 麦克风中允许 Materm 访问。".to_string());
                }
                Err(e) => return Err(e),
            }
        }
        Err(e) => return Err(e),
    }

    let provider = provider.unwrap_or_else(|| "whisper".to_string());
    let lang = language.unwrap_or_else(|| "zh".to_string());

    match provider.as_str() {
        "alibaba" => {
            println!("[Speech] Starting DashScope Paraformer recognition");
            let settings = AppSettings::load()
                .map_err(|e| format!("Failed to load settings: {}", e))?;

            if settings.alibaba_api_key.is_empty() {
                return Err("DashScope API Key 未配置，请在设置中填写。".to_string());
            }

            alibaba::start_recognition(app, settings.alibaba_api_key, lang)?;
            Ok(())
        }
        _ => {
            // Default: Whisper
            println!("[Speech] Starting Whisper recognition");
            whisper::start_whisper_recognition(app, lang)
        }
    }
}

/// Stop speech recognition (stops whichever provider is active)
#[tauri::command]
pub async fn speech_stop_recognition(_app: tauri::AppHandle) -> Result<(), String> {
    println!("[Speech] Stopping recognition...");

    if whisper::is_whisper_listening() {
        whisper::stop_whisper_recognition();
    }

    if alibaba::is_listening() {
        alibaba::stop_recognition();
    }

    Ok(())
}

/// Check if currently listening (either provider)
#[tauri::command]
pub fn speech_is_listening() -> bool {
    whisper::is_whisper_listening() || alibaba::is_listening()
}

/// Save speech recognition settings
#[tauri::command]
pub async fn speech_save_settings(
    provider: String,
    alibaba_api_key: String,
) -> Result<(), String> {
    let mut settings = AppSettings::load()
        .map_err(|e| format!("Failed to load settings: {}", e))?;

    settings.speech_provider = provider;
    settings.alibaba_api_key = alibaba_api_key;

    settings.save()
        .map_err(|e| format!("Failed to save settings: {}", e))?;

    println!("[Speech] Settings saved (provider: {})", settings.speech_provider);
    Ok(())
}

/// Load speech recognition settings
#[tauri::command]
pub async fn speech_load_settings() -> Result<SpeechSettings, String> {
    let settings = AppSettings::load()
        .map_err(|e| format!("Failed to load settings: {}", e))?;

    Ok(SpeechSettings {
        provider: settings.speech_provider,
        alibaba_api_key: settings.alibaba_api_key,
    })
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechSettings {
    pub provider: String,
    pub alibaba_api_key: String,
}
