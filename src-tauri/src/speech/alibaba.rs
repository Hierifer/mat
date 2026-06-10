// DashScope Paraformer real-time speech recognition
// Uses WebSocket with Bearer API Key authentication
// Protocol: https://help.aliyun.com/zh/model-studio/websocket-for-paraformer-real-time-service

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::Emitter;
use tokio::net::TcpStream;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, tungstenite::Message};
use futures_util::stream::SplitSink;

use super::audio;
use super::whisper::{SpeechRecognitionResult, SpeechRecognitionError};

type WsStream = WebSocketStream<MaybeTlsStream<TcpStream>>;
type WsSink = SplitSink<WsStream, Message>;

lazy_static::lazy_static! {
    static ref ALIBABA_LISTENING: Arc<AtomicBool> = Arc::new(AtomicBool::new(false));
}

// ============================================================================
// DashScope message structures
// ============================================================================

#[derive(Serialize)]
struct DashScopeRequest {
    header: DashScopeRequestHeader,
    payload: serde_json::Value,
}

#[derive(Serialize)]
struct DashScopeRequestHeader {
    action: String,
    task_id: String,
    streaming: String,
}

#[derive(Deserialize, Debug)]
struct DashScopeResponse {
    header: DashScopeResponseHeader,
    #[serde(default)]
    payload: Option<serde_json::Value>,
}

#[derive(Deserialize, Debug)]
#[allow(dead_code)]
struct DashScopeResponseHeader {
    event: String,
    task_id: String,
    #[serde(default)]
    error_code: Option<String>,
    #[serde(default)]
    error_message: Option<String>,
    #[serde(default)]
    attributes: Option<serde_json::Value>,
}

// ============================================================================
// Public API
// ============================================================================

/// Start DashScope Paraformer real-time recognition
pub fn start_recognition(
    app: tauri::AppHandle,
    api_key: String,
    language: String,
) -> Result<(), String> {
    if ALIBABA_LISTENING.load(Ordering::Relaxed) {
        return Err("Already listening".to_string());
    }

    ALIBABA_LISTENING.store(true, Ordering::Relaxed);
    let is_listening = ALIBABA_LISTENING.clone();

    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("Failed to create tokio runtime");

        rt.block_on(async {
            if let Err(e) = run_session(app.clone(), api_key, language, is_listening).await {
                println!("[DashScope] Session error: {}", e);
                let _ = app.emit("speech-error", SpeechRecognitionError {
                    error: "dashscope_error".to_string(),
                    message: e.clone(),
                });
            }
        });
    });

    Ok(())
}

/// Stop recognition
pub fn stop_recognition() {
    ALIBABA_LISTENING.store(false, Ordering::Relaxed);
    println!("[DashScope] Stop requested");
}

pub fn is_listening() -> bool {
    ALIBABA_LISTENING.load(Ordering::Relaxed)
}

// ============================================================================
// WebSocket session
// ============================================================================

async fn run_session(
    app: tauri::AppHandle,
    api_key: String,
    language: String,
    is_listening: Arc<AtomicBool>,
) -> Result<(), String> {
    use tokio_tungstenite::connect_async;
    use tokio_tungstenite::tungstenite::http::Request;
    use futures_util::{SinkExt, StreamExt};

    let task_id = uuid::Uuid::new_v4().to_string();

    // Connect with Authorization header
    let request = Request::builder()
        .uri("wss://dashscope.aliyuncs.com/api-ws/v1/inference/")
        .header("Authorization", format!("bearer {}", api_key))
        .header("Host", "dashscope.aliyuncs.com")
        .header("Connection", "Upgrade")
        .header("Upgrade", "websocket")
        .header("Sec-WebSocket-Version", "13")
        .header("Sec-WebSocket-Key", tokio_tungstenite::tungstenite::handshake::client::generate_key())
        .body(())
        .map_err(|e| format!("Failed to build request: {}", e))?;

    println!("[DashScope] Connecting...");
    let (ws_stream, _) = connect_async(request).await
        .map_err(|e| format!("WebSocket 连接失败: {}", e))?;

    println!("[DashScope] Connected");
    let (mut ws_write, mut ws_read): (WsSink, _) = ws_stream.split();

    // Build language_hints
    let lang_hints: Vec<&str> = match language.as_str() {
        "zh" => vec!["zh"],
        "en" => vec!["en"],
        "ja" => vec!["ja"],
        _ => vec!["zh", "en"],
    };

    // Send run-task
    let run_task = DashScopeRequest {
        header: DashScopeRequestHeader {
            action: "run-task".to_string(),
            task_id: task_id.clone(),
            streaming: "duplex".to_string(),
        },
        payload: serde_json::json!({
            "task_group": "audio",
            "task": "asr",
            "function": "recognition",
            "model": "paraformer-realtime-v2",
            "parameters": {
                "format": "pcm",
                "sample_rate": 16000,
                "language_hints": lang_hints,
            },
            "input": {}
        }),
    };

    let run_json = serde_json::to_string(&run_task)
        .map_err(|e| format!("Failed to serialize run-task: {}", e))?;

    ws_write.send(Message::from(run_json))
        .await
        .map_err(|e| format!("Failed to send run-task: {}", e))?;

    println!("[DashScope] Sent run-task");

    // Wait for task-started
    let mut task_started = false;
    while let Some(msg) = ws_read.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                if let Ok(resp) = serde_json::from_str::<DashScopeResponse>(&text) {
                    match resp.header.event.as_str() {
                        "task-started" => {
                            println!("[DashScope] Task started");
                            task_started = true;
                            break;
                        }
                        "task-failed" => {
                            let err = resp.header.error_message
                                .unwrap_or_else(|| "Unknown error".to_string());
                            return Err(format!("任务启动失败: {}", err));
                        }
                        _ => {
                            println!("[DashScope] Unexpected event: {}", resp.header.event);
                        }
                    }
                }
            }
            Ok(Message::Close(_)) => {
                return Err("WebSocket 在任务启动前关闭".to_string());
            }
            Err(e) => {
                return Err(format!("WebSocket error: {}", e));
            }
            _ => {}
        }
    }

    if !task_started {
        return Err("任务未启动".to_string());
    }

    // Start audio capture with small chunks (1600 samples = 100ms at 16kHz)
    let (audio_tx, audio_rx) = std::sync::mpsc::channel::<Vec<f32>>();
    let is_listening_audio = is_listening.clone();

    std::thread::spawn(move || {
        if let Err(e) = audio::capture_audio(audio_tx, is_listening_audio, 1600) {
            println!("[DashScope] Audio capture error: {}", e);
        }
    });

    // Bridge std::sync::mpsc to tokio::sync::mpsc so we can use async select!
    let (tokio_audio_tx, mut tokio_audio_rx) = tokio::sync::mpsc::unbounded_channel::<Vec<f32>>();
    std::thread::spawn(move || {
        while let Ok(chunk) = audio_rx.recv() {
            if tokio_audio_tx.send(chunk).is_err() {
                break;
            }
        }
    });

    // Single event loop: concurrently send audio and receive results
    let mut audio_done = false;
    let task_id_finish = task_id.clone();

    loop {
        tokio::select! {
            // Send audio chunks to the server
            chunk = tokio_audio_rx.recv(), if !audio_done => {
                match chunk {
                    Some(data) if is_listening.load(Ordering::Relaxed) => {
                        let pcm_bytes = audio::f32_to_pcm16_bytes(&data);
                        for frame in pcm_bytes.chunks(3200) {
                            if let Err(e) = ws_write.send(Message::from(frame.to_vec())).await {
                                println!("[DashScope] Failed to send audio: {}", e);
                                audio_done = true;
                                break;
                            }
                        }
                    }
                    _ => {
                        // Channel closed or stop requested — send finish-task
                        println!("[DashScope] Sending finish-task...");
                        let finish_msg = DashScopeRequest {
                            header: DashScopeRequestHeader {
                                action: "finish-task".to_string(),
                                task_id: task_id_finish.clone(),
                                streaming: "duplex".to_string(),
                            },
                            payload: serde_json::json!({ "input": {} }),
                        };
                        if let Ok(json) = serde_json::to_string(&finish_msg) {
                            let _ = ws_write.send(Message::from(json)).await;
                        }
                        audio_done = true;
                    }
                }
            }
            // Receive recognition results from the server
            msg = ws_read.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(resp) = serde_json::from_str::<DashScopeResponse>(&text) {
                            match resp.header.event.as_str() {
                                "result-generated" => {
                                    if let Some(payload) = &resp.payload {
                                        if let Some(sentence) = payload.pointer("/output/sentence") {
                                            if sentence.get("heartbeat").and_then(|v| v.as_bool()).unwrap_or(false) {
                                                continue;
                                            }
                                            let text = sentence.get("text")
                                                .and_then(|v| v.as_str())
                                                .unwrap_or("");
                                            let sentence_end = sentence.get("sentence_end")
                                                .and_then(|v| v.as_bool())
                                                .unwrap_or(false);
                                            if !text.is_empty() {
                                                if sentence_end {
                                                    println!("[DashScope] Final: '{}'", text);
                                                }
                                                let _ = app.emit("speech-result", SpeechRecognitionResult {
                                                    text: text.to_string(),
                                                    is_final: sentence_end,
                                                });
                                            }
                                        }
                                    }
                                }
                                "task-finished" => {
                                    println!("[DashScope] Task finished");
                                    break;
                                }
                                "task-failed" => {
                                    let err = resp.header.error_message
                                        .unwrap_or_else(|| "Unknown error".to_string());
                                    println!("[DashScope] Task failed: {}", err);
                                    let _ = app.emit("speech-error", SpeechRecognitionError {
                                        error: "task_failed".to_string(),
                                        message: err,
                                    });
                                    break;
                                }
                                other => {
                                    println!("[DashScope] Event: {}", other);
                                }
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) => {
                        println!("[DashScope] WebSocket closed");
                        break;
                    }
                    Some(Err(e)) => {
                        println!("[DashScope] WebSocket error: {}", e);
                        break;
                    }
                    None => {
                        println!("[DashScope] WebSocket stream ended");
                        break;
                    }
                    _ => {}
                }
            }
        }
    }

    is_listening.store(false, Ordering::Relaxed);
    println!("[DashScope] Session ended");
    Ok(())
}
