// Alibaba Cloud NLS (智能语音交互) real-time speech recognition
// Uses WebSocket to stream audio and receive transcription results

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::sync::mpsc::channel;
use tauri::Emitter;
use tokio::net::TcpStream;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, tungstenite::Message};
use futures_util::stream::{SplitSink, SplitStream};

use super::audio;
use super::whisper::{SpeechRecognitionResult, SpeechRecognitionError};

/// Type alias for the WebSocket stream
type WsStream = WebSocketStream<MaybeTlsStream<TcpStream>>;
/// Type alias for the write half of a split WebSocket
type WsSink = SplitSink<WsStream, Message>;

// ============================================================================
// Token management
// ============================================================================

#[derive(Debug, Clone)]
struct CachedToken {
    token: String,
    expire_time: i64, // Unix timestamp
}

lazy_static::lazy_static! {
    static ref TOKEN_CACHE: Mutex<Option<CachedToken>> = Mutex::new(None);
    static ref ALIBABA_LISTENING: Arc<AtomicBool> = Arc::new(AtomicBool::new(false));
}

/// Generate or retrieve a cached Alibaba Cloud NLS token
pub async fn get_token(access_key_id: &str, access_key_secret: &str) -> Result<String, String> {
    // Check cache
    {
        let cache = TOKEN_CACHE.lock().unwrap();
        if let Some(ref cached) = *cache {
            let now = chrono::Utc::now().timestamp();
            // Refresh if expiring within 5 minutes
            if cached.expire_time > now + 300 {
                return Ok(cached.token.clone());
            }
        }
    }

    println!("[Alibaba] Generating new NLS token...");
    let (token, expire_time) = create_token(access_key_id, access_key_secret).await?;

    // Cache it
    {
        let mut cache = TOKEN_CACHE.lock().unwrap();
        *cache = Some(CachedToken {
            token: token.clone(),
            expire_time,
        });
    }

    println!("[Alibaba] Token generated, expires at {}", expire_time);
    Ok(token)
}

/// Call Alibaba Cloud CreateToken API
async fn create_token(access_key_id: &str, access_key_secret: &str) -> Result<(String, i64), String> {
    use hmac::{Hmac, Mac};
    use sha1::Sha1;
    use base64::Engine;
    use chrono::Utc;

    let timestamp = Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    let nonce = uuid::Uuid::new_v4().to_string();

    // Build sorted query parameters (Alibaba Cloud API signature v1)
    let mut params = vec![
        ("AccessKeyId", access_key_id.to_string()),
        ("Action", "CreateToken".to_string()),
        ("Format", "JSON".to_string()),
        ("RegionId", "cn-shanghai".to_string()),
        ("SignatureMethod", "HMAC-SHA1".to_string()),
        ("SignatureNonce", nonce),
        ("SignatureVersion", "1.0".to_string()),
        ("Timestamp", timestamp),
        ("Version", "2019-02-28".to_string()),
    ];

    params.sort_by(|a, b| a.0.cmp(&b.0));

    // Build canonical query string
    let canonical_query: String = params.iter()
        .map(|(k, v)| format!("{}={}", percent_encode(k), percent_encode(v)))
        .collect::<Vec<_>>()
        .join("&");

    // Build string to sign
    let string_to_sign = format!(
        "GET&{}&{}",
        percent_encode("/"),
        percent_encode(&canonical_query)
    );

    // Sign with HMAC-SHA1
    let signing_key = format!("{}&", access_key_secret);
    let mut mac = Hmac::<Sha1>::new_from_slice(signing_key.as_bytes())
        .map_err(|e| format!("HMAC init failed: {}", e))?;
    mac.update(string_to_sign.as_bytes());
    let signature = base64::engine::general_purpose::STANDARD.encode(mac.finalize().into_bytes());

    // Build final URL
    let url = format!(
        "http://nls-meta.cn-shanghai.aliyuncs.com/?{}&Signature={}",
        canonical_query,
        percent_encode(&signature)
    );

    // Make HTTP request
    let client = reqwest::Client::new();
    let resp = client.get(&url)
        .send()
        .await
        .map_err(|e| format!("Token request failed: {}", e))?;

    let status = resp.status();
    let body = resp.text().await
        .map_err(|e| format!("Failed to read token response: {}", e))?;

    if !status.is_success() {
        return Err(format!("Token API returned {}: {}", status, body));
    }

    // Parse response
    let json: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    let token = json["Token"]["Id"]
        .as_str()
        .ok_or_else(|| format!("Token not found in response: {}", body))?
        .to_string();

    let expire_time = json["Token"]["ExpireTime"]
        .as_i64()
        .unwrap_or_else(|| chrono::Utc::now().timestamp() + 86400); // Default 24h

    Ok((token, expire_time))
}

/// URL percent-encoding for Alibaba Cloud API signature
fn percent_encode(s: &str) -> String {
    let mut result = String::new();
    for byte in s.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                result.push(byte as char);
            }
            _ => {
                result.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    result
}

// ============================================================================
// NLS WebSocket client
// ============================================================================

#[derive(Serialize)]
struct NlsMessage {
    header: NlsHeader,
    #[serde(skip_serializing_if = "Option::is_none")]
    payload: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    context: Option<serde_json::Value>,
}

#[derive(Serialize)]
struct NlsHeader {
    message_id: String,
    task_id: String,
    namespace: String,
    name: String,
    appkey: String,
}

#[derive(Deserialize, Debug)]
struct NlsResponse {
    header: NlsResponseHeader,
    #[serde(default)]
    payload: Option<serde_json::Value>,
}

#[derive(Deserialize, Debug)]
#[allow(dead_code)]
struct NlsResponseHeader {
    name: String,
    status: Option<i32>,
    status_text: Option<String>,
    #[serde(default)]
    message_id: String,
}

/// Start Alibaba Cloud NLS recognition
pub fn start_recognition(
    app: tauri::AppHandle,
    app_key: String,
    token: String,
    language: String,
) -> Result<(), String> {
    if ALIBABA_LISTENING.load(Ordering::Relaxed) {
        return Err("Already listening".to_string());
    }

    ALIBABA_LISTENING.store(true, Ordering::Relaxed);

    let is_listening = ALIBABA_LISTENING.clone();

    // Run the WebSocket client on the tokio runtime
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("Failed to create tokio runtime");

        rt.block_on(async {
            if let Err(e) = run_nls_session(app.clone(), app_key, token, language, is_listening).await {
                println!("[Alibaba] NLS session error: {}", e);
                let _ = app.emit("speech-error", SpeechRecognitionError {
                    error: "nls_error".to_string(),
                    message: e.clone(),
                });
            }
        });
    });

    Ok(())
}

/// Stop Alibaba Cloud NLS recognition
pub fn stop_recognition() {
    ALIBABA_LISTENING.store(false, Ordering::Relaxed);
    println!("[Alibaba] Stop requested");
}

pub fn is_listening() -> bool {
    ALIBABA_LISTENING.load(Ordering::Relaxed)
}

/// Run a complete NLS WebSocket session
async fn run_nls_session(
    app: tauri::AppHandle,
    app_key: String,
    token: String,
    _language: String,
    is_listening: Arc<AtomicBool>,
) -> Result<(), String> {
    use tokio_tungstenite::connect_async;
    use futures_util::{SinkExt, StreamExt};

    let task_id = uuid::Uuid::new_v4().to_string().replace('-', "");

    // Connect to NLS gateway
    let ws_url = format!(
        "wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1?token={}",
        token
    );

    println!("[Alibaba] Connecting to NLS gateway...");
    let (ws_stream, _) = connect_async(&ws_url).await
        .map_err(|e| format!("WebSocket connection failed: {}", e))?;

    println!("[Alibaba] Connected to NLS gateway");

    let (mut ws_write, mut ws_read): (WsSink, SplitStream<WsStream>) = ws_stream.split();

    // Send StartTranscription
    let start_msg = NlsMessage {
        header: NlsHeader {
            message_id: uuid::Uuid::new_v4().to_string().replace('-', ""),
            task_id: task_id.clone(),
            namespace: "SpeechTranscriber".to_string(),
            name: "StartTranscription".to_string(),
            appkey: app_key.clone(),
        },
        payload: Some(serde_json::json!({
            "format": "pcm",
            "sample_rate": 16000,
            "enable_intermediate_result": true,
            "enable_punctuation_prediction": true,
            "enable_inverse_text_normalization": true,
        })),
        context: Some(serde_json::json!({
            "sdk": {
                "name": "materm",
                "version": "1.0"
            }
        })),
    };

    let start_json = serde_json::to_string(&start_msg)
        .map_err(|e| format!("Failed to serialize start message: {}", e))?;

    ws_write.send(Message::from(start_json))
        .await
        .map_err(|e| format!("Failed to send start message: {}", e))?;

    println!("[Alibaba] Sent StartTranscription");

    // Wait for TranscriptionStarted response
    let mut transcription_started = false;
    while let Some(msg) = ws_read.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                if let Ok(resp) = serde_json::from_str::<NlsResponse>(&text) {
                    match resp.header.name.as_str() {
                        "TranscriptionStarted" => {
                            println!("[Alibaba] Transcription started");
                            transcription_started = true;
                            break;
                        }
                        "TaskFailed" => {
                            let err_msg = resp.header.status_text
                                .unwrap_or_else(|| "Unknown error".to_string());
                            return Err(format!("NLS task failed: {}", err_msg));
                        }
                        _ => {
                            println!("[Alibaba] Unexpected response: {}", resp.header.name);
                        }
                    }
                }
            }
            Ok(Message::Close(_)) => {
                return Err("WebSocket closed before transcription started".to_string());
            }
            Err(e) => {
                return Err(format!("WebSocket error: {}", e));
            }
            _ => {}
        }
    }

    if !transcription_started {
        return Err("Transcription did not start".to_string());
    }

    // Start audio capture thread
    let (audio_tx, audio_rx) = channel::<Vec<f32>>();
    let is_listening_audio = is_listening.clone();

    std::thread::spawn(move || {
        if let Err(e) = audio::capture_audio(audio_tx, is_listening_audio) {
            println!("[Alibaba] Audio capture error: {}", e);
        }
    });

    // Send audio data and receive results concurrently
    let is_listening_send = is_listening.clone();
    let task_id_stop = task_id.clone();
    let app_key_stop = app_key.clone();

    // Wrap writer in Arc<Mutex> for shared access
    let ws_write: Arc<tokio::sync::Mutex<WsSink>> = Arc::new(tokio::sync::Mutex::new(ws_write));
    let ws_write_audio = ws_write.clone();
    let ws_write_stop = ws_write.clone();

    // Audio sending task
    let audio_send_handle = tokio::spawn(async move {
        loop {
            // Try to receive audio data with timeout
            match audio_rx.recv_timeout(std::time::Duration::from_millis(100)) {
                Ok(audio_chunk) => {
                    if !is_listening_send.load(Ordering::Relaxed) {
                        break;
                    }
                    let pcm_bytes = audio::f32_to_pcm16_bytes(&audio_chunk);
                    // Send in smaller frames (3200 bytes = 100ms of 16kHz 16-bit audio)
                    for frame in pcm_bytes.chunks(3200) {
                        let mut writer = ws_write_audio.lock().await;
                        if let Err(e) = writer.send(Message::from(frame.to_vec())).await {
                            println!("[Alibaba] Failed to send audio: {}", e);
                            return;
                        }
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    if !is_listening_send.load(Ordering::Relaxed) {
                        break;
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                    break;
                }
            }
        }

        // Send StopTranscription
        println!("[Alibaba] Sending StopTranscription...");
        let stop_msg = NlsMessage {
            header: NlsHeader {
                message_id: uuid::Uuid::new_v4().to_string().replace('-', ""),
                task_id: task_id_stop,
                namespace: "SpeechTranscriber".to_string(),
                name: "StopTranscription".to_string(),
                appkey: app_key_stop,
            },
            payload: None,
            context: None,
        };

        if let Ok(json) = serde_json::to_string(&stop_msg) {
            let mut writer = ws_write_stop.lock().await;
            let _ = writer.send(Message::from(json)).await;
        }
    });

    // Result receiving loop
    let app_recv = app.clone();
    while let Some(msg) = ws_read.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                if let Ok(resp) = serde_json::from_str::<NlsResponse>(&text) {
                    match resp.header.name.as_str() {
                        "TranscriptionResultChanged" => {
                            if let Some(payload) = &resp.payload {
                                if let Some(result) = payload.get("result").and_then(|r| r.as_str()) {
                                    if !result.is_empty() {
                                        let _ = app_recv.emit("speech-result", SpeechRecognitionResult {
                                            text: result.to_string(),
                                            is_final: false,
                                        });
                                    }
                                }
                            }
                        }
                        "SentenceEnd" => {
                            if let Some(payload) = &resp.payload {
                                if let Some(result) = payload.get("result").and_then(|r| r.as_str()) {
                                    if !result.is_empty() {
                                        println!("[Alibaba] Final: '{}'", result);
                                        let _ = app_recv.emit("speech-result", SpeechRecognitionResult {
                                            text: result.to_string(),
                                            is_final: true,
                                        });
                                    }
                                }
                            }
                        }
                        "TranscriptionCompleted" => {
                            println!("[Alibaba] Transcription completed");
                            break;
                        }
                        "TaskFailed" => {
                            let err_msg = resp.header.status_text
                                .unwrap_or_else(|| "Unknown error".to_string());
                            println!("[Alibaba] Task failed: {}", err_msg);
                            let _ = app_recv.emit("speech-error", SpeechRecognitionError {
                                error: "task_failed".to_string(),
                                message: err_msg,
                            });
                            break;
                        }
                        other => {
                            println!("[Alibaba] Event: {}", other);
                        }
                    }
                }
            }
            Ok(Message::Close(_)) => {
                println!("[Alibaba] WebSocket closed");
                break;
            }
            Err(e) => {
                println!("[Alibaba] WebSocket error: {}", e);
                break;
            }
            _ => {}
        }
    }

    // Wait for audio send task to finish
    let _ = audio_send_handle.await;

    is_listening.store(false, Ordering::Relaxed);
    println!("[Alibaba] NLS session ended");
    Ok(())
}
