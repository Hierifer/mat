mod pty;

use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::Manager; // Import Manager trait
use pty::manager::PtyManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Use tokio Mutex for async compatibility in commands
            let pty_manager = Arc::new(Mutex::new(PtyManager::new()));
            app.manage(pty_manager);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pty::commands::pty_spawn,
            pty::commands::pty_write,
            pty::commands::pty_resize,
            pty::commands::pty_close,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
