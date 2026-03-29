use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::sync::mpsc::{channel, Sender, Receiver};
use tauri::Emitter;
use whisper_rs::{WhisperContext, WhisperContextParameters, FullParams, SamplingStrategy};
use std::path::PathBuf;

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

/// Check if Whisper is available (model file exists)
#[tauri::command]
pub async fn speech_check_availability() -> Result<bool, String> {
    let model_path = get_model_path();
    Ok(model_path.exists())
}

/// Start speech recognition
#[tauri::command]
pub async fn speech_start_recognition(
    app: tauri::AppHandle,
    language: Option<String>,
) -> Result<(), String> {
    println!("[Whisper] Starting recognition with language: {:?}", language);

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
    println!("[Whisper] Audio processing thread started");

    while let Ok(audio_chunk) = rx.recv() {
        if let Ok(text) = transcribe_audio(&ctx, &audio_chunk, &language) {
            if !text.trim().is_empty() {
                println!("[Whisper] Transcribed: {}", text);
                let _ = app.emit("speech-result", SpeechRecognitionResult {
                    text,
                    is_final: false,
                });
            }
        }
    }

    println!("[Whisper] Audio processing thread stopped");
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

// Transcribe audio using Whisper
fn transcribe_audio(ctx: &WhisperContext, audio_data: &[f32], language: &str) -> Result<String, String> {
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });

    // Set language
    params.set_language(Some(language));
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);

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

    Ok(result.trim().to_string())
}
