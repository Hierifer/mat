use std::sync::Arc;
use std::time::Duration;
use tauri::{command, AppHandle, Emitter, State};
use tokio::sync::Mutex;

use super::manager::{AgentAttachment, AgentManager};

#[derive(serde::Serialize)]
pub struct AgentSpawnResponse {
    pub agent_id: String,
}

#[command]
pub async fn agent_spawn(
    manager: State<'_, Arc<Mutex<AgentManager>>>,
    app_handle: AppHandle,
    cwd: String,
) -> Result<AgentSpawnResponse, String> {
    let agent_id = manager.lock().await.spawn(cwd, app_handle.clone())?;

    // Watch for process exit and notify frontend
    {
        let manager = manager.inner().clone();
        let agent_id = agent_id.clone();
        let event_name = format!("agent_exit_{}", agent_id);
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_millis(500)).await;
                let mut mgr = manager.lock().await;
                match mgr.try_wait(&agent_id) {
                    Ok(Some(code)) => {
                        mgr.remove(&agent_id);
                        drop(mgr);
                        let _ = app_handle.emit(&event_name, code);
                        break;
                    }
                    Ok(None) => {}
                    // Session was removed (killed) — stop watching
                    Err(_) => break,
                }
            }
        });
    }

    Ok(AgentSpawnResponse { agent_id })
}

#[command]
pub async fn agent_send(
    manager: State<'_, Arc<Mutex<AgentManager>>>,
    agent_id: String,
    text: String,
    attachments: Option<Vec<AgentAttachment>>,
) -> Result<(), String> {
    manager
        .lock()
        .await
        .send(&agent_id, &text, attachments.unwrap_or_default())
        .await
}

#[command]
pub async fn agent_kill(
    manager: State<'_, Arc<Mutex<AgentManager>>>,
    agent_id: String,
) -> Result<(), String> {
    manager.lock().await.kill(&agent_id).await
}
