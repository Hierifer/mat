mod pty;

use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::{Manager, Emitter}; // Import Manager and Emitter traits
use tauri::menu::{MenuBuilder, SubmenuBuilder};
use pty::manager::PtyManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_stt::init())
        .setup(|app| {
            // Use tokio Mutex for async compatibility in commands
            let pty_manager = Arc::new(Mutex::new(PtyManager::new()));
            app.manage(pty_manager);

            // Build the menu
            let file_menu = SubmenuBuilder::new(app, "File")
                .text("close_tab", "Close Tab")
                .text("close_window", "Close Window")
                .separator()
                .quit()
                .build()?;

            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .copy()
                .paste()
                .separator()
                .select_all()
                .separator()
                .text("clear_terminal", "Clear Terminal")
                .build()?;

            let view_menu = SubmenuBuilder::new(app, "View")
                .text("split_horizontal", "Split Horizontally")
                .text("split_vertical", "Split Vertically")
                .separator()
                .text("zoom_in", "Zoom In")
                .text("zoom_out", "Zoom Out")
                .text("zoom_reset", "Reset Zoom")
                .separator()
                .text("toggle_fullscreen", "Toggle Fullscreen")
                .build()?;

            let mat_menu = SubmenuBuilder::new(app, "Mat")
                .text("about", "About Mat")
                .separator()
                .text("check_updates", "Check for Updates...")
                .text("settings", "Settings...")
                .separator()
                .hide()
                .quit()
                .build()?;

            let menu = MenuBuilder::new(app)
                .items(&[&mat_menu, &file_menu, &edit_menu, &view_menu])
                .build()?;

            app.set_menu(menu)?;

            // Handle menu events
            app.on_menu_event(move |app_handle, event| {
                match event.id().0.as_str() {
                    "about" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.emit("menu:about", ());
                        }
                    }
                    "check_updates" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.emit("menu:check-updates", ());
                        }
                    }
                    "settings" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.emit("menu:settings", ());
                        }
                    }
                    "close_tab" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.emit("menu:close-tab", ());
                        }
                    }
                    "close_window" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.close();
                        }
                    }
                    "clear_terminal" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.emit("menu:clear-terminal", ());
                        }
                    }
                    "split_horizontal" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.emit("menu:split-horizontal", ());
                        }
                    }
                    "split_vertical" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.emit("menu:split-vertical", ());
                        }
                    }
                    "zoom_in" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.emit("menu:zoom-in", ());
                        }
                    }
                    "zoom_out" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.emit("menu:zoom-out", ());
                        }
                    }
                    "zoom_reset" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.emit("menu:zoom-reset", ());
                        }
                    }
                    "toggle_fullscreen" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.emit("menu:toggle-fullscreen", ());
                        }
                    }
                    _ => {}
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pty::commands::pty_spawn,
            pty::commands::pty_write,
            pty::commands::pty_resize,
            pty::commands::pty_close,
            pty::commands::pty_list_sessions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
