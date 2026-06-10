// Shared audio capture and processing utilities
// Used by both Whisper and Alibaba Cloud speech recognition

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::sync::mpsc::Sender;

/// Capture audio from the default input device and send chunks via the channel.
/// `chunk_size` controls how many 16kHz samples to accumulate before sending
/// (e.g., 1600 = 100ms for real-time streaming, 48000 = 3s for batch processing).
/// Stops when `is_listening` is set to false.
pub fn capture_audio(audio_tx: Sender<Vec<f32>>, is_listening: Arc<AtomicBool>, chunk_size: usize) -> Result<(), String> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

    println!("[Audio] Initializing audio capture...");

    let host = cpal::default_host();
    let device = host.default_input_device()
        .ok_or_else(|| {
            "找不到音频输入设备。\n\n可能原因：\n\
            1. 没有麦克风硬件\n\
            2. 麦克风被系统禁用\n\
            3. 权限被拒绝\n\n\
            请检查：系统设置 > 隐私与安全性 > 麦克风".to_string()
        })?;

    println!("[Audio] Using input device: {}", device.name().unwrap_or_default());

    let config = device.default_input_config()
        .map_err(|e| {
            format!("无法获取音频配置: {}\n\n\
                    可能是麦克风权限被拒绝。\n\
                    请检查：系统设置 > 隐私与安全性 > 麦克风\n\
                    确保 Mat 已被启用。", e)
        })?;

    println!("[Audio] Audio format: {:?}", config);

    let sample_rate = config.sample_rate().0;
    let channels = config.channels() as usize;

    let err_fn = |err| eprintln!("[Audio] Audio stream error: {}", err);

    // Shared buffer for accumulating audio chunks
    let buffer: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
    let buffer_clone = buffer.clone();
    let is_listening_clone = is_listening.clone();
    let audio_tx_clone = audio_tx.clone();

    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => {
            device.build_input_stream(
                &config.into(),
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    if !is_listening_clone.load(Ordering::Relaxed) {
                        return;
                    }
                    let processed = preprocess_audio(data, channels, sample_rate);
                    let mut buf = buffer_clone.lock().unwrap();
                    buf.extend_from_slice(&processed);
                    while buf.len() >= chunk_size {
                        let chunk: Vec<f32> = buf.drain(..chunk_size).collect();
                        let _ = audio_tx_clone.send(chunk);
                    }
                },
                err_fn,
                None,
            )
        }
        cpal::SampleFormat::I16 => {
            let buffer_clone2 = buffer.clone();
            let is_listening_clone2 = is_listening.clone();
            let audio_tx_clone2 = audio_tx.clone();
            device.build_input_stream(
                &config.into(),
                move |data: &[i16], _: &cpal::InputCallbackInfo| {
                    if !is_listening_clone2.load(Ordering::Relaxed) {
                        return;
                    }
                    let float_data: Vec<f32> = data.iter()
                        .map(|&s| s as f32 / i16::MAX as f32)
                        .collect();
                    let processed = preprocess_audio(&float_data, channels, sample_rate);
                    let mut buf = buffer_clone2.lock().unwrap();
                    buf.extend_from_slice(&processed);
                    while buf.len() >= chunk_size {
                        let chunk: Vec<f32> = buf.drain(..chunk_size).collect();
                        let _ = audio_tx_clone2.send(chunk);
                    }
                },
                err_fn,
                None,
            )
        }
        _ => {
            return Err("不支持的音频采样格式".to_string());
        }
    }.map_err(|e| {
        format!("无法创建音频流: {}\n\n\
                这通常意味着麦克风权限被拒绝。\n\n\
                解决方案：\n\
                1. 打开：系统设置 > 隐私与安全性 > 麦克风\n\
                2. 启用 Mat 的麦克风权限\n\
                3. 重启 Mat 应用\n\n\
                如果 Mat 不在列表中，说明权限请求失败。\n\
                请尝试运行：tccutil reset Microphone com.hierifer.mat", e)
    })?;

    stream.play().map_err(|e| {
        format!("无法启动音频流: {}\n\n\
                请确保：\n\
                1. 麦克风未被其他应用占用\n\
                2. 麦克风硬件正常工作\n\
                3. 系统音频服务正常", e)
    })?;

    println!("[Audio] Audio capture started");

    // Keep stream alive while listening
    while is_listening.load(Ordering::Relaxed) {
        std::thread::sleep(std::time::Duration::from_millis(100));
    }

    // Flush remaining buffer
    {
        let mut buf = buffer.lock().unwrap();
        if !buf.is_empty() {
            let remaining = buf.drain(..).collect::<Vec<f32>>();
            let _ = audio_tx.send(remaining);
        }
    }

    println!("[Audio] Audio capture stopped");
    Ok(())
}

/// Pre-process raw audio: convert to mono and resample to 16kHz
fn preprocess_audio(data: &[f32], channels: usize, sample_rate: u32) -> Vec<f32> {
    // Convert to mono if stereo
    let mono_data: Vec<f32> = if channels == 2 {
        data.chunks(2).map(|chunk| (chunk[0] + chunk.get(1).copied().unwrap_or(0.0)) / 2.0).collect()
    } else {
        data.to_vec()
    };

    // Resample to 16kHz if needed
    if sample_rate != 16000 {
        resample_audio(&mono_data, sample_rate, 16000)
    } else {
        mono_data
    }
}

/// Simple linear resampling
pub fn resample_audio(input: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
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

/// Detect if audio data contains speech (simple volume-based detection)
pub fn has_speech_activity(audio_data: &[f32]) -> bool {
    if audio_data.is_empty() {
        return false;
    }

    let rms = (audio_data.iter()
        .map(|&s| s * s)
        .sum::<f32>() / audio_data.len() as f32)
        .sqrt();

    const SILENCE_THRESHOLD: f32 = 0.01;

    if rms < SILENCE_THRESHOLD {
        return false;
    }

    let non_zero_samples = audio_data.iter()
        .filter(|&&s| s.abs() > 0.001)
        .count();

    let non_zero_ratio = non_zero_samples as f32 / audio_data.len() as f32;

    non_zero_ratio > 0.1
}

/// Convert f32 PCM audio to 16-bit PCM bytes (little-endian)
pub fn f32_to_pcm16_bytes(samples: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(samples.len() * 2);
    for &sample in samples {
        let clamped = sample.max(-1.0).min(1.0);
        let int_sample = (clamped * 32767.0) as i16;
        bytes.extend_from_slice(&int_sample.to_le_bytes());
    }
    bytes
}
