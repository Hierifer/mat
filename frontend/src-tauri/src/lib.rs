mod pty;
mod settings;
#[cfg(any(target_os = "macos", target_os = "linux"))]
mod speech;

use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::{Manager, Emitter}; // Import Manager and Emitter traits
use tauri::menu::{MenuBuilder, SubmenuBuilder};
use pty::manager::PtyManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_notification::init());

    // macOS-specific plugins
    #[cfg(target_os = "macos")]
    {
        builder = builder.plugin(tauri_plugin_macos_permissions::init());
    }

    builder
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
                let menu_id = event.id().0.as_str();
                println!("[Menu] Event triggered: {}", menu_id);

                match menu_id {
                    "about" => {
                        println!("[Menu] Opening About dialog");
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.emit("menu:about", ());
                        }
                    }
                    "check_updates" => {
                        println!("[Menu] Check for Updates clicked!");
                        println!("[Menu] Emitting menu:check-updates event to frontend");
                        if let Some(window) = app_handle.get_webview_window("main") {
                            match window.emit("menu:check-updates", ()) {
                                Ok(_) => println!("[Menu] ✅ Event emitted successfully"),
                                Err(e) => println!("[Menu] ❌ Failed to emit event: {:?}", e),
                            }
                        } else {
                            println!("[Menu] ❌ Window 'main' not found!");
                        }
                    }
                    "settings" => {
                        println!("[Menu] Opening Settings");
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
            // tmux commands
            pty::commands::tmux_list_sessions,
            pty::commands::tmux_attach_session,
            pty::commands::tmux_kill_session,
            pty::commands::tmux_rename_session,
            pty::commands::tmux_get_history,
            pty::commands::tmux_search_history,
            pty::commands::tmux_export_history,
            pty::commands::tmux_check_installed,
            pty::commands::tmux_get_version,
            // settings commands
            pty::commands::settings_get,
            pty::commands::settings_update,
            // speech commands (macOS and Linux only)
            #[cfg(any(target_os = "macos", target_os = "linux"))]
            speech::speech_check_availability,
            #[cfg(any(target_os = "macos", target_os = "linux"))]
            speech::speech_check_permission,
            #[cfg(any(target_os = "macos", target_os = "linux"))]
            speech::speech_start_recognition,
            #[cfg(any(target_os = "macos", target_os = "linux"))]
            speech::speech_stop_recognition,
            #[cfg(any(target_os = "macos", target_os = "linux"))]
            speech::speech_is_listening,
            #[cfg(any(target_os = "macos", target_os = "linux"))]
            speech::speech_list_devices,
            #[cfg(any(target_os = "macos", target_os = "linux"))]
            speech::speech_test_microphone,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
