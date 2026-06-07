use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::sync::mpsc::{channel, Receiver};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Emitter;
use whisper_rs::{WhisperContext, WhisperContextParameters, FullParams, SamplingStrategy};
use std::path::PathBuf;

use super::audio;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpeechRecognitionResult {
    pub text: String,
    pub is_final: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpeechRecognitionError {
    pub error: String,
    pub message: String,
}

// Global state
lazy_static::lazy_static! {
    static ref RECOGNITION_STATE: Arc<Mutex<RecognitionState>> = Arc::new(Mutex::new(RecognitionState::default()));
    static ref WHISPER_LISTENING: Arc<AtomicBool> = Arc::new(AtomicBool::new(false));
}

struct RecognitionState {
    whisper_ctx: Option<Arc<WhisperContext>>,
}

impl Default for RecognitionState {
    fn default() -> Self {
        Self {
            whisper_ctx: None,
        }
    }
}

/// Check if Whisper is available (model file exists)
#[tauri::command]
pub async fn speech_check_availability() -> Result<bool, String> {
    let model_path = get_model_path();
    Ok(model_path.exists())
}

/// 检查麦克风权限状态（不弹窗）
#[tauri::command]
pub async fn speech_check_permission() -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        check_microphone_permission_macos()
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(true)
    }
}

/// 主动请求麦克风权限（会弹出系统授权对话框）
#[tauri::command]
pub async fn speech_request_permission() -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        request_microphone_permission_macos().await
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(true)
    }
}

#[cfg(target_os = "macos")]
fn check_microphone_permission_macos() -> Result<bool, String> {
    use std::process::Command;
    let output = Command::new("osascript")
        .args([
            "-e",
            "use framework \"AVFoundation\"
             set status to current application's AVCaptureDevice's authorizationStatusForMediaType:(current application's AVMediaTypeAudio)
             return status as integer",
        ])
        .output()
        .map_err(|e| format!("Failed to check permission: {}", e))?;

    let status_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let status: i32 = status_str.parse().unwrap_or(-1);

    println!("[Whisper] macOS microphone permission status: {} (0=notDetermined, 2=denied, 3=authorized)", status);

    match status {
        3 => Ok(true),
        0 => Ok(false),
        _ => Ok(false),
    }
}

#[cfg(target_os = "macos")]
async fn request_microphone_permission_macos() -> Result<bool, String> {
    use std::sync::{Arc, Condvar, Mutex as StdMutex};

    let already_granted = check_microphone_permission_macos().unwrap_or(false);
    if already_granted {
        println!("[Whisper] Microphone permission already granted");
        return Ok(true);
    }

    println!("[Whisper] Requesting microphone permission via AVCaptureDevice...");

    let pair = Arc::new((StdMutex::new(None::<bool>), Condvar::new()));
    let pair_clone = pair.clone();

    std::thread::spawn(move || {
        use std::process::Command;
        let output = Command::new("osascript")
            .args([
                "-e",
                "use framework \"AVFoundation\"
                 use framework \"Foundation\"

                 set theResult to missing value
                 set isComplete to false

                 current application's AVCaptureDevice's requestAccessForMediaType:(current application's AVMediaTypeAudio) completionHandler:(void)
                 delay 0.5

                 -- After requesting, check the status
                 repeat 20 times
                     set status to current application's AVCaptureDevice's authorizationStatusForMediaType:(current application's AVMediaTypeAudio)
                     set statusInt to status as integer
                     if statusInt is not 0 then
                         return statusInt
                     end if
                     delay 0.5
                 end repeat
                 return 0",
            ])
            .output();

        let granted = match output {
            Ok(out) => {
                let status_str = String::from_utf8_lossy(&out.stdout).trim().to_string();
                let status: i32 = status_str.parse().unwrap_or(0);
                println!("[Whisper] Permission request result status: {}", status);
                status == 3
            }
            Err(e) => {
                println!("[Whisper] Permission request failed: {}", e);
                false
            }
        };

        let (lock, cvar) = &*pair_clone;
        let mut result = lock.lock().unwrap();
        *result = Some(granted);
        cvar.notify_one();
    });

    let (lock, cvar) = &*pair;
    let result = lock.lock().unwrap();
    let (result, _) = cvar.wait_timeout_while(
        result,
        std::time::Duration::from_secs(15),
        |r| r.is_none(),
    ).map_err(|e| format!("Permission wait failed: {}", e))?;

    let granted = result.unwrap_or(false);
    println!("[Whisper] Microphone permission granted: {}", granted);
    Ok(granted)
}

/// 列出可用的音频输入设备（用于调试）
#[tauri::command]
pub async fn speech_list_devices() -> Result<Vec<String>, String> {
    use cpal::traits::{DeviceTrait, HostTrait};

    let host = cpal::default_host();
    let mut devices = Vec::new();

    match host.input_devices() {
        Ok(input_devices) => {
            for (idx, device) in input_devices.enumerate() {
                if let Ok(name) = device.name() {
                    devices.push(format!("{}. {}", idx + 1, name));
                }
            }
        }
        Err(e) => {
            return Err(format!("Failed to enumerate devices: {}", e));
        }
    }

    if let Some(default_device) = host.default_input_device() {
        if let Ok(name) = default_device.name() {
            devices.insert(0, format!("默认设备: {}", name));
        }
    }

    Ok(devices)
}

/// 测试麦克风录音（录制 2 秒并返回音量信息）
#[tauri::command]
pub async fn speech_test_microphone() -> Result<String, String> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    use std::sync::{Arc, Mutex};

    let host = cpal::default_host();
    let device = host.default_input_device()
        .ok_or("No input device available")?;

    let config = device.default_input_config()
        .map_err(|e| format!("Failed to get config: {}", e))?;

    println!("[Test] Device: {}", device.name().unwrap_or_default());
    println!("[Test] Config: {:?}", config);

    let sample_rate = config.sample_rate().0;
    let channels = config.channels() as usize;

    let audio_data = Arc::new(Mutex::new(Vec::new()));
    let audio_data_clone = audio_data.clone();
    let max_samples = sample_rate as usize * 2;

    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => {
            device.build_input_stream(
                &config.into(),
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    let mut audio = audio_data_clone.lock().unwrap();
                    if audio.len() < max_samples {
                        audio.extend_from_slice(data);
                    }
                },
                |err| eprintln!("[Test] Error: {}", err),
                None,
            )
        }
        cpal::SampleFormat::I16 => {
            device.build_input_stream(
                &config.into(),
                move |data: &[i16], _: &cpal::InputCallbackInfo| {
                    let mut audio = audio_data_clone.lock().unwrap();
                    if audio.len() < max_samples {
                        let float_data: Vec<f32> = data.iter()
                            .map(|&s| s as f32 / i16::MAX as f32)
                            .collect();
                        audio.extend_from_slice(&float_data);
                    }
                },
                |err| eprintln!("[Test] Error: {}", err),
                None,
            )
        }
        _ => {
            return Err("Unsupported sample format".to_string());
        }
    }.map_err(|e| format!("Failed to build stream: {}", e))?;

    stream.play().map_err(|e| format!("Failed to start stream: {}", e))?;

    println!("[Test] Recording for 2 seconds... Please speak!");
    std::thread::sleep(std::time::Duration::from_secs(2));
    drop(stream);

    let audio = audio_data.lock().unwrap();
    let samples = audio.len();

    if samples == 0 {
        return Ok("没有捕获到任何音频！\n\n可能原因：\n1. 麦克风权限被拒绝\n2. 麦克风被禁用或静音\n3. 系统音频设置问题\n\n请检查：系统设置 > 隐私与安全性 > 麦克风".to_string());
    }

    let rms = (audio.iter()
        .map(|&s| s * s)
        .sum::<f32>() / samples as f32)
        .sqrt();

    let max_amplitude = audio.iter()
        .map(|&s| s.abs())
        .fold(0.0f32, |a, b| a.max(b));

    let non_zero = audio.iter()
        .filter(|&&s| s.abs() > 0.001)
        .count();

    let result = format!(
        "麦克风测试成功！\n\n\
        录制信息：\n\
        - 采样数: {}\n\
        - 采样率: {} Hz\n\
        - 声道数: {}\n\
        - 录制时长: {:.1} 秒\n\n\
        音频质量：\n\
        - RMS 音量: {:.6}\n\
        - 最大振幅: {:.6}\n\
        - 有效样本: {:.1}%\n\n\
        诊断：\n{}",
        samples,
        sample_rate,
        channels,
        samples as f32 / sample_rate as f32,
        rms,
        max_amplitude,
        (non_zero as f32 / samples as f32) * 100.0,
        if rms < 0.001 {
            "音量太低！请大声说话或靠近麦克风"
        } else if rms < 0.01 {
            "音量较低，可以检测到语音但可能识别率较低"
        } else if rms < 0.1 {
            "音量正常，适合语音识别"
        } else {
            "音量很好！"
        }
    );

    Ok(result)
}

/// Start Whisper speech recognition
pub fn start_whisper_recognition(
    app: tauri::AppHandle,
    language: String,
) -> Result<(), String> {
    println!("[Whisper] Starting recognition with language: {}", language);

    if WHISPER_LISTENING.load(Ordering::Relaxed) {
        return Err("Already listening".to_string());
    }

    let mut state = RECOGNITION_STATE.lock().unwrap();

    // Initialize Whisper if not already done
    if state.whisper_ctx.is_none() {
        let model_path = get_model_path();
        if !model_path.exists() {
            return Err(format!(
                "Whisper model not found at {:?}. Please run: curl -L https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin -o {:?}",
                model_path, model_path
            ));
        }

        println!("[Whisper] Loading model from {:?}", model_path);

        let ctx = WhisperContext::new_with_params(
            model_path.to_str().unwrap(),
            WhisperContextParameters::default(),
        ).map_err(|e| format!("Failed to load Whisper model: {}", e))?;

        state.whisper_ctx = Some(Arc::new(ctx));
        println!("[Whisper] Model loaded successfully");
    }

    let ctx = state.whisper_ctx.as_ref().unwrap().clone();
    drop(state);

    WHISPER_LISTENING.store(true, Ordering::Relaxed);

    // Create channel for audio processing
    let (tx, rx) = channel::<Vec<f32>>();

    // Start audio processing thread
    let app_clone = app.clone();
    let lang_clone = language.clone();

    std::thread::spawn(move || {
        process_audio_stream(rx, ctx, app_clone, lang_clone);
    });

    // Start audio recording in background using shared audio module
    let is_listening = WHISPER_LISTENING.clone();
    std::thread::spawn(move || {
        if let Err(e) = audio::capture_audio(tx, is_listening) {
            println!("[Whisper] Audio capture error: {}", e);
        }
    });

    Ok(())
}

/// Stop Whisper speech recognition
pub fn stop_whisper_recognition() {
    println!("[Whisper] Stopping recognition...");
    WHISPER_LISTENING.store(false, Ordering::Relaxed);
}

/// Check if Whisper is currently listening
pub fn is_whisper_listening() -> bool {
    WHISPER_LISTENING.load(Ordering::Relaxed)
}

// Get model path
fn get_model_path() -> PathBuf {
    let candidates = vec![
        PathBuf::from("models/ggml-base.bin"),
        PathBuf::from("../models/ggml-base.bin"),
        dirs::data_local_dir()
            .map(|d| d.join("mat/models/ggml-base.bin"))
            .unwrap_or_default(),
    ];

    for path in candidates {
        if path.exists() {
            return path;
        }
    }

    PathBuf::from("models/ggml-base.bin")
}

// Process audio stream from channel
fn process_audio_stream(
    rx: Receiver<Vec<f32>>,
    ctx: Arc<WhisperContext>,
    app: tauri::AppHandle,
    language: String,
) {
    println!("[Whisper] Audio processing thread started (language: {})", language);

    let mut chunk_count = 0;

    while let Ok(audio_chunk) = rx.recv() {
        chunk_count += 1;

        let rms = (audio_chunk.iter()
            .map(|&s| s * s)
            .sum::<f32>() / audio_chunk.len() as f32)
            .sqrt();

        println!("[Whisper] Processing chunk #{} ({} samples, RMS: {:.4})",
                 chunk_count, audio_chunk.len(), rms);

        match transcribe_audio(&ctx, &audio_chunk, &language) {
            Ok(text) => {
                if !text.trim().is_empty() {
                    println!("[Whisper] Transcribed: '{}'", text);
                    let _ = app.emit("speech-result", SpeechRecognitionResult {
                        text,
                        is_final: false,
                    });
                } else {
                    println!("[Whisper] No speech detected (silent or filtered)");
                }
            }
            Err(e) => {
                println!("[Whisper] Transcription error: {}", e);
            }
        }
    }

    println!("[Whisper] Audio processing thread stopped (processed {} chunks)", chunk_count);
}

// Transcribe audio using Whisper
fn transcribe_audio(ctx: &WhisperContext, audio_data: &[f32], language: &str) -> Result<String, String> {
    if !audio::has_speech_activity(audio_data) {
        return Ok(String::new());
    }

    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });

    params.set_language(Some(language));
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    params.set_suppress_blank(true);
    params.set_suppress_non_speech_tokens(true);
    params.set_temperature(0.0);
    params.set_no_speech_thold(0.6);

    let mut state = ctx.create_state()
        .map_err(|e| format!("Failed to create state: {}", e))?;

    state.full(params, audio_data)
        .map_err(|e| format!("Transcription failed: {}", e))?;

    let num_segments = state.full_n_segments()
        .map_err(|e| format!("Failed to get segments: {}", e))?;

    let mut result = String::new();
    for i in 0..num_segments {
        if let Ok(text) = state.full_get_segment_text(i) {
            result.push_str(&text);
        }
    }

    let result = result.trim().to_string();

    if is_hallucination(&result) {
        println!("[Whisper] Filtered hallucination: '{}'", result);
        return Ok(String::new());
    }

    Ok(result)
}

fn is_hallucination(text: &str) -> bool {
    if text.is_empty() {
        return true;
    }

    const CHINESE_HALLUCINATIONS: &[&str] = &[
        "你不是在那裡嗎",
        "你不是在那里吗",
        "謝謝觀看",
        "谢谢观看",
        "請訂閱",
        "请订阅",
        "字幕由",
        "Amara.org",
        "請不要忘記訂閱",
    ];

    const ENGLISH_HALLUCINATIONS: &[&str] = &[
        "Thanks for watching",
        "Please subscribe",
        "Don't forget to subscribe",
        "Subtitles by",
        "Transcribed by",
        "www.amara.org",
    ];

    let text_lower = text.to_lowercase();

    for phrase in CHINESE_HALLUCINATIONS.iter().chain(ENGLISH_HALLUCINATIONS.iter()) {
        if text.contains(phrase) || text_lower.contains(&phrase.to_lowercase()) {
            return true;
        }
    }

    if is_repetitive(text) {
        return true;
    }

    if text.len() < 2 {
        return true;
    }

    false
}

fn is_repetitive(text: &str) -> bool {
    if text.len() < 6 {
        return false;
    }

    let chars: Vec<char> = text.chars().collect();
    for i in 0..chars.len().saturating_sub(5) {
        if chars[i..i+5].iter().all(|&c| c == chars[i]) {
            return true;
        }
    }

    let words: Vec<&str> = text.split_whitespace().collect();
    if words.len() >= 3 {
        for i in 0..words.len() - 2 {
            if words[i] == words[i+1] && words[i+1] == words[i+2] {
                return true;
            }
        }
    }

    false
}
