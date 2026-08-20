use std::env;
use std::fs;
#[cfg(target_os = "macos")]
use std::process::Command;
use uuid::Uuid;

#[tauri::command]
pub fn send_macos_notification(title: String, body: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let script = format!(
            "display notification \"{}\" with title \"{}\"",
            body.replace('\\', "\\\\").replace('"', "\\\""),
            title.replace('\\', "\\\\").replace('"', "\\\""),
        );
        Command::new("osascript")
            .args(["-e", &script])
            .output()
            .map_err(|e| format!("Failed to send notification: {}", e))?;
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (title, body);
        Err("osascript notifications are macOS-only".to_string())
    }
}

#[tauri::command]
pub fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|e| format!("Failed to read file {}: {}", path, e))
}

#[tauri::command]
pub fn save_clipboard_image(data: Vec<u8>, mime_type: Option<String>) -> Result<String, String> {
    let ext = match mime_type.as_deref() {
        Some("image/jpeg") | Some("image/jpg") => "jpg",
        Some("image/gif") => "gif",
        Some("image/webp") => "webp",
        Some("image/bmp") => "bmp",
        _ => "png",
    };

    let filename = format!("materm-paste-{}.{}", Uuid::new_v4(), ext);
    let path = env::temp_dir().join(&filename);

    fs::write(&path, &data).map_err(|e| format!("Failed to write image: {}", e))?;

    path.to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Invalid path encoding".to_string())
}
