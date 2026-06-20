use std::env;
use std::fs;
use uuid::Uuid;

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
