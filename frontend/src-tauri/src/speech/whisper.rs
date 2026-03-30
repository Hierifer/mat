use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::sync::mpsc::{channel, Sender, Receiver};
use tauri::Emitter;
use whisper_rs::{WhisperContext, WhisperContextParameters, FullParams, SamplingStrategy};
use std::path::PathBuf;

#[cfg(target_os = "macos")]
use objc::{msg_send, sel, sel_impl, class};
#[cfg(target_os = "macos")]
use cocoa::base::id;

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
}

struct RecognitionState {
    is_listening: bool,
    audio_buffer: Vec<f32>,
    whisper_ctx: Option<Arc<WhisperContext>>,
    audio_tx: Option<Sender<Vec<f32>>>,
}

impl Default for RecognitionState {
    fn default() -> Self {
        Self {
            is_listening: false,
            audio_buffer: Vec::new(),
            whisper_ctx: None,
            audio_tx: None,
        }
    }
}

/// 检查并请求麦克风权限（macOS）
#[cfg(target_os = "macos")]
fn check_microphone_permission() -> Result<bool, String> {
    unsafe {
        // 获取 AVCaptureDevice 类
        let av_capture_device = class!(AVCaptureDevice);

        // 获取音频媒体类型
        let av_media_type_audio_str = "AVMediaTypeAudio";
        let av_media_type_audio: id = msg_send![class!(NSString), stringWithUTF8String: av_media_type_audio_str.as_ptr()];

        // 检查当前权限状态
        let auth_status: i64 = msg_send![av_capture_device, authorizationStatusForMediaType: av_media_type_audio];

        println!("[Whisper] Microphone permission status: {}", auth_status);
        // 0 = NotDetermined (未询问)
        // 1 = Restricted (受限)
        // 2 = Denied (拒绝)
        // 3 = Authorized (已授权)

        match auth_status {
            3 => {
                // 已授权
                println!("[Whisper] ✓ Microphone permission granted");
                Ok(true)
            }
            2 => {
                // 被拒绝
                println!("[Whisper] ✗ Microphone permission denied");
                Err("麦克风权限被拒绝。\n\n请前往：系统设置 > 隐私与安全性 > 麦克风\n启用 Mat 的麦克风权限，然后重启应用。".to_string())
            }
            1 => {
                // 受限
                println!("[Whisper] ✗ Microphone permission restricted");
                Err("麦克风访问受限（可能是家长控制或企业策略）。".to_string())
            }
            0 => {
                // 未询问 - 需要请求权限
                println!("[Whisper] ⚠ Microphone permission not determined, requesting...");

                // 请求权限（这会显示系统对话框）
                let (tx, rx) = std::sync::mpsc::channel();

                let completion_handler = block::ConcreteBlock::new(move |granted: bool| {
                    let _ = tx.send(granted);
                });
                let completion_handler = completion_handler.copy();

                let _: () = msg_send![av_capture_device,
                    requestAccessForMediaType: av_media_type_audio
                    completionHandler: completion_handler];

                // 等待用户响应
                match rx.recv_timeout(std::time::Duration::from_secs(60)) {
                    Ok(granted) => {
                        if granted {
                            println!("[Whisper] ✓ User granted microphone permission");
                            Ok(true)
                        } else {
                            println!("[Whisper] ✗ User denied microphone permission");
                            Err("用户拒绝了麦克风权限请求。\n\n如需使用语音识别，请重新启动应用并授予权限。".to_string())
                        }
                    }
                    Err(_) => {
                        println!("[Whisper] ⚠ Permission request timeout");
                        Err("权限请求超时。请检查是否有系统对话框需要响应。".to_string())
                    }
                }
            }
            _ => {
                println!("[Whisper] ✗ Unknown permission status: {}", auth_status);
                Err(format!("未知的权限状态: {}", auth_status))
            }
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn check_microphone_permission() -> Result<bool, String> {
    // 非 macOS 平台暂时假设有权限
    Ok(true)
}

/// Check if Whisper is available (model file exists)
#[tauri::command]
pub async fn speech_check_availability() -> Result<bool, String> {
    let model_path = get_model_path();
    Ok(model_path.exists())
}

/// 检查麦克风权限
#[tauri::command]
pub async fn speech_check_permission() -> Result<bool, String> {
    check_microphone_permission()
}

/// 列出可用的音频输入设备（用于调试）
#[tauri::command]
pub async fn speech_list_devices() -> Result<Vec<String>, String> {
    use cpal::traits::{DeviceTrait, HostTrait};

    let host = cpal::default_host();
    let mut devices = Vec::new();

    // 列出所有输入设备
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

    // 获取默认输入设备
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

    // 收集 2 秒的音频数据
    let audio_data = Arc::new(Mutex::new(Vec::new()));
    let audio_data_clone = audio_data.clone();
    let max_samples = sample_rate as usize * 2; // 2 seconds

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

    // 等待 2 秒
    std::thread::sleep(std::time::Duration::from_secs(2));

    drop(stream);

    let audio = audio_data.lock().unwrap();
    let samples = audio.len();

    if samples == 0 {
        return Ok("⚠️ 没有捕获到任何音频！\n\n可能原因：\n1. 麦克风权限被拒绝\n2. 麦克风被禁用或静音\n3. 系统音频设置问题\n\n请检查：系统设置 > 隐私与安全性 > 麦克风".to_string());
    }

    // 计算音频统计信息
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
        "✅ 麦克风测试成功！\n\n\
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
            "⚠️ 音量太低！请大声说话或靠近麦克风"
        } else if rms < 0.01 {
            "⚡ 音量较低，可以检测到语音但可能识别率较低"
        } else if rms < 0.1 {
            "✓ 音量正常，适合语音识别"
        } else {
            "✓ 音量很好！"
        }
    );

    Ok(result)
}

/// Start speech recognition
#[tauri::command]
pub async fn speech_start_recognition(
    app: tauri::AppHandle,
    language: Option<String>,
) -> Result<(), String> {
    println!("[Whisper] Starting recognition with language: {:?}", language);

    // 首先检查麦克风权限
    println!("[Whisper] Checking microphone permission...");
    match check_microphone_permission() {
        Ok(true) => {
            println!("[Whisper] ✓ Permission check passed");
        }
        Ok(false) => {
            return Err("麦克风权限检查失败".to_string());
        }
        Err(e) => {
            println!("[Whisper] ✗ Permission check failed: {}", e);
            return Err(e);
        }
    }

    let mut state = RECOGNITION_STATE.lock().unwrap();

    if state.is_listening {
        return Err("Already listening".to_string());
    }

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

    state.is_listening = true;
    state.audio_buffer.clear();

    // Create channel for audio processing
    let (tx, rx) = channel::<Vec<f32>>();
    state.audio_tx = Some(tx.clone());

    // Start audio processing thread
    let app_clone = app.clone();
    let lang = language.unwrap_or_else(|| "zh".to_string());
    let lang_clone = lang.clone();
    let ctx = state.whisper_ctx.as_ref().unwrap().clone();

    std::thread::spawn(move || {
        process_audio_stream(rx, ctx, app_clone, lang_clone);
    });

    // Start audio recording in background
    std::thread::spawn(move || {
        if let Err(e) = capture_audio(tx) {
            println!("[Whisper] Audio capture error: {}", e);
        }
    });

    drop(state);
    Ok(())
}

/// Stop speech recognition
#[tauri::command]
pub async fn speech_stop_recognition(app: tauri::AppHandle) -> Result<(), String> {
    println!("[Whisper] Stopping recognition...");

    let mut state = RECOGNITION_STATE.lock().unwrap();
    state.is_listening = false;

    // Process any remaining audio
    if !state.audio_buffer.is_empty() && state.audio_buffer.len() > 8000 {
        // Only process if we have at least 0.5 seconds of audio
        if let Some(tx) = state.audio_tx.as_ref() {
            let audio_data = state.audio_buffer.clone();
            let _ = tx.send(audio_data);
        }
    }

    state.audio_buffer.clear();
    state.audio_tx = None; // Drop the sender to signal processing thread to stop

    drop(state);
    Ok(())
}

/// Check if currently listening
#[tauri::command]
pub fn speech_is_listening() -> bool {
    RECOGNITION_STATE.lock().unwrap().is_listening
}

// Get model path
fn get_model_path() -> PathBuf {
    // Try to find model in several locations
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

    // Default to models/ggml-base.bin
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

        // 计算音频特征用于调试
        let rms = (audio_chunk.iter()
            .map(|&s| s * s)
            .sum::<f32>() / audio_chunk.len() as f32)
            .sqrt();

        println!("[Whisper] Processing chunk #{} ({} samples, RMS: {:.4})",
                 chunk_count, audio_chunk.len(), rms);

        match transcribe_audio(&ctx, &audio_chunk, &language) {
            Ok(text) => {
                if !text.trim().is_empty() {
                    println!("[Whisper] ✓ Transcribed: '{}'", text);
                    let _ = app.emit("speech-result", SpeechRecognitionResult {
                        text,
                        is_final: false,
                    });
                } else {
                    println!("[Whisper] ○ No speech detected (silent or filtered)");
                }
            }
            Err(e) => {
                println!("[Whisper] ✗ Transcription error: {}", e);
            }
        }
    }

    println!("[Whisper] Audio processing thread stopped (processed {} chunks)", chunk_count);
}

// Capture audio from microphone
fn capture_audio(audio_tx: Sender<Vec<f32>>) -> Result<(), String> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

    println!("[Whisper] Initializing audio capture...");

    let host = cpal::default_host();
    let device = host.default_input_device()
        .ok_or("No input device available")?;

    println!("[Whisper] Using input device: {}", device.name().unwrap_or_default());

    let config = device.default_input_config()
        .map_err(|e| format!("Failed to get default input config: {}", e))?;

    println!("[Whisper] Audio format: {:?}", config);

    let sample_rate = config.sample_rate().0;
    let channels = config.channels() as usize;

    // Build audio stream
    let err_fn = |err| eprintln!("[Whisper] Audio stream error: {}", err);

    let audio_tx_clone = audio_tx.clone();
    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => {
            device.build_input_stream(
                &config.into(),
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    process_audio_chunk(data, channels, sample_rate, &audio_tx_clone);
                },
                err_fn,
                None,
            )
        }
        cpal::SampleFormat::I16 => {
            let audio_tx_clone2 = audio_tx.clone();
            device.build_input_stream(
                &config.into(),
                move |data: &[i16], _: &cpal::InputCallbackInfo| {
                    let float_data: Vec<f32> = data.iter()
                        .map(|&s| s as f32 / i16::MAX as f32)
                        .collect();
                    process_audio_chunk(&float_data, channels, sample_rate, &audio_tx_clone2);
                },
                err_fn,
                None,
            )
        }
        _ => {
            return Err("Unsupported sample format".to_string());
        }
    }.map_err(|e| format!("Failed to build input stream: {}", e))?;

    stream.play().map_err(|e| format!("Failed to start stream: {}", e))?;

    println!("[Whisper] Audio capture started");

    // Keep stream alive while listening
    while RECOGNITION_STATE.lock().unwrap().is_listening {
        std::thread::sleep(std::time::Duration::from_millis(100));
    }

    println!("[Whisper] Audio capture stopped");
    Ok(())
}

// Process audio chunk
fn process_audio_chunk(data: &[f32], channels: usize, sample_rate: u32, audio_tx: &Sender<Vec<f32>>) {
    let mut state = RECOGNITION_STATE.lock().unwrap();

    if !state.is_listening {
        return;
    }

    // Convert to mono if stereo
    let mono_data: Vec<f32> = if channels == 2 {
        data.chunks(2).map(|chunk| (chunk[0] + chunk[1]) / 2.0).collect()
    } else {
        data.to_vec()
    };

    // Resample to 16kHz if needed (Whisper expects 16kHz)
    let resampled = if sample_rate != 16000 {
        resample_audio(&mono_data, sample_rate, 16000)
    } else {
        mono_data
    };

    state.audio_buffer.extend_from_slice(&resampled);

    // Transcribe every 3 seconds of audio (48000 samples at 16kHz)
    if state.audio_buffer.len() >= 48000 {
        let audio_chunk = state.audio_buffer.drain(..48000).collect::<Vec<f32>>();

        // Send to processing thread
        let _ = audio_tx.send(audio_chunk);
    }
}

// Simple linear resampling
fn resample_audio(input: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
    if from_rate == to_rate {
        return input.to_vec();
    }

    let ratio = from_rate as f32 / to_rate as f32;
    let output_len = (input.len() as f32 / ratio) as usize;
    let mut output = Vec::with_capacity(output_len);

    for i in 0..output_len {
        let src_idx = (i as f32 * ratio) as usize;
        if src_idx < input.len() {
            output.push(input[src_idx]);
        }
    }

    output
}

// 检测音频是否包含语音（简单的音量检测）
fn has_speech_activity(audio_data: &[f32]) -> bool {
    // 计算 RMS (均方根) 音量
    let rms = (audio_data.iter()
        .map(|&s| s * s)
        .sum::<f32>() / audio_data.len() as f32)
        .sqrt();

    // 音量阈值 - 低于此值认为是静音
    const SILENCE_THRESHOLD: f32 = 0.01;

    if rms < SILENCE_THRESHOLD {
        return false;
    }

    // 检查是否有足够的非零样本
    let non_zero_samples = audio_data.iter()
        .filter(|&&s| s.abs() > 0.001)
        .count();

    let non_zero_ratio = non_zero_samples as f32 / audio_data.len() as f32;

    // 至少 10% 的样本应该是有意义的声音
    non_zero_ratio > 0.1
}

// Transcribe audio using Whisper
fn transcribe_audio(ctx: &WhisperContext, audio_data: &[f32], language: &str) -> Result<String, String> {
    // 首先检查是否有语音活动
    if !has_speech_activity(audio_data) {
        return Ok(String::new()); // 返回空字符串，不转录静音
    }

    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });

    // Set language
    params.set_language(Some(language));
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);

    // 防止幻觉的关键参数
    params.set_suppress_blank(true);  // 抑制空白输出
    params.set_suppress_non_speech_tokens(true);  // 抑制非语音标记

    // 设置温度为 0 以获得最确定的结果（减少随机性）
    params.set_temperature(0.0);

    // 提高无语音概率阈值
    params.set_no_speech_thold(0.6);  // 默认 0.6，提高可以减少幻觉

    // Create a new state for this transcription
    let mut state = ctx.create_state()
        .map_err(|e| format!("Failed to create state: {}", e))?;

    // Run transcription
    state.full(params, audio_data)
        .map_err(|e| format!("Transcription failed: {}", e))?;

    // Get number of segments
    let num_segments = state.full_n_segments()
        .map_err(|e| format!("Failed to get segments: {}", e))?;

    // Collect all text
    let mut result = String::new();
    for i in 0..num_segments {
        if let Ok(text) = state.full_get_segment_text(i) {
            result.push_str(&text);
        }
    }

    let result = result.trim().to_string();

    // 过滤常见的 Whisper 幻觉短语
    if is_hallucination(&result) {
        println!("[Whisper] Filtered hallucination: '{}'", result);
        return Ok(String::new());
    }

    Ok(result)
}

// 检测是否是 Whisper 的常见幻觉
fn is_hallucination(text: &str) -> bool {
    if text.is_empty() {
        return true;
    }

    // 常见的中文幻觉短语
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

    // 常见的英文幻觉短语
    const ENGLISH_HALLUCINATIONS: &[&str] = &[
        "Thanks for watching",
        "Please subscribe",
        "Don't forget to subscribe",
        "Subtitles by",
        "Transcribed by",
        "www.amara.org",
    ];

    let text_lower = text.to_lowercase();

    // 检查是否匹配已知幻觉
    for phrase in CHINESE_HALLUCINATIONS.iter().chain(ENGLISH_HALLUCINATIONS.iter()) {
        if text.contains(phrase) || text_lower.contains(&phrase.to_lowercase()) {
            return true;
        }
    }

    // 检查是否是重复字符（另一种幻觉形式）
    if is_repetitive(text) {
        return true;
    }

    // 太短的输出可能是噪音
    if text.len() < 2 {
        return true;
    }

    false
}

// 检测重复文本
fn is_repetitive(text: &str) -> bool {
    if text.len() < 6 {
        return false;
    }

    // 检查是否有字符重复超过 5 次
    let chars: Vec<char> = text.chars().collect();
    for i in 0..chars.len() - 5 {
        if chars[i..i+5].iter().all(|&c| c == chars[i]) {
            return true;
        }
    }

    // 检查是否有词组重复（如 "ABC ABC ABC"）
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
