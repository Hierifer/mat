// Speech recognition module
// Supports Whisper (local) and Alibaba Cloud NLS providers

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
            println!("[Speech] Starting Alibaba Cloud NLS recognition");
            // Load credentials from settings
            let settings = AppSettings::load()
                .map_err(|e| format!("Failed to load settings: {}", e))?;

            if settings.alibaba_app_key.is_empty()
                || settings.alibaba_access_key_id.is_empty()
                || settings.alibaba_access_key_secret.is_empty()
            {
                return Err("阿里云语音识别凭据未配置。请在设置中填写 AppKey、AccessKey ID 和 AccessKey Secret。".to_string());
            }

            // Generate token
            let token = alibaba::get_token(
                &settings.alibaba_access_key_id,
                &settings.alibaba_access_key_secret,
            ).await?;

            // Start recognition
            alibaba::start_recognition(
                app,
                settings.alibaba_app_key,
                token,
                lang,
            )?;

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
    alibaba_app_key: String,
    alibaba_access_key_id: String,
    alibaba_access_key_secret: String,
) -> Result<(), String> {
    let mut settings = AppSettings::load()
        .map_err(|e| format!("Failed to load settings: {}", e))?;

    settings.speech_provider = provider;
    settings.alibaba_app_key = alibaba_app_key;
    settings.alibaba_access_key_id = alibaba_access_key_id;
    settings.alibaba_access_key_secret = alibaba_access_key_secret;

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
        alibaba_app_key: settings.alibaba_app_key,
        alibaba_access_key_id: settings.alibaba_access_key_id,
        alibaba_access_key_secret: settings.alibaba_access_key_secret,
    })
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechSettings {
    pub provider: String,
    pub alibaba_app_key: String,
    pub alibaba_access_key_id: String,
    pub alibaba_access_key_secret: String,
}
