use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::Emitter;

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

// Global state to manage speech recognition session
lazy_static::lazy_static! {
    static ref RECOGNITION_STATE: Arc<Mutex<RecognitionState>> = Arc::new(Mutex::new(RecognitionState::default()));
}

#[derive(Default)]
struct RecognitionState {
    is_listening: bool,
    should_stop: bool,
    // Store audio engine, task and request as raw pointer addresses (usize is Send/Sync)
    audio_engine_ptr: Option<usize>,
    recognition_task_ptr: Option<usize>,
    recognition_request_ptr: Option<usize>,
}

/// Check if speech recognition is available on this device
#[tauri::command]
pub async fn speech_check_availability() -> Result<bool, String> {
    // On macOS 10.15+, speech recognition is always available
    // but requires user permission
    Ok(true)
}

/// Start speech recognition
#[tauri::command]
pub async fn speech_start_recognition(
    app: tauri::AppHandle,
    language: Option<String>,
) -> Result<(), String> {
    let mut state = RECOGNITION_STATE.lock().unwrap();

    if state.is_listening {
        return Err("Speech recognition is already running".to_string());
    }

    state.is_listening = true;
    drop(state); // Release lock before async operation

    let lang = language.unwrap_or_else(|| "zh-CN".to_string());
    println!("[Speech Native] Starting recognition with language: {}", lang);

    // Spawn recognition in background and keep thread alive for audio engine
    tokio::task::spawn_blocking(move || {
        let result = start_native_recognition(app.clone(), lang);

        if let Err(e) = result {
            println!("[Speech Native] Recognition start failed: {}", e);
            let _ = app.emit("speech-error", SpeechRecognitionError {
                error: "recognition-failed".to_string(),
                message: e,
            });

            // Update state
            if let Ok(mut state) = RECOGNITION_STATE.lock() {
                state.is_listening = false;
            }
            return;
        }

        println!("[Speech Native] Recognition thread running, starting RunLoop...");

        // Run NSRunLoop to keep audio engine processing
        // This is essential for AVAudioEngine to continue capturing audio
        unsafe {
            use cocoa::base::nil;
            use cocoa::foundation::NSAutoreleasePool;
            use objc::runtime::Class;
            use objc::{msg_send, sel, sel_impl};

            let pool = NSAutoreleasePool::new(nil);

            // Get current run loop
            let run_loop_class = Class::get("NSRunLoop").unwrap();
            let current_run_loop: cocoa::base::id = msg_send![run_loop_class, currentRunLoop];

            println!("[Speech Native] RunLoop started");

            // Get task pointer for monitoring
            let task_ptr = {
                if let Ok(state) = RECOGNITION_STATE.lock() {
                    state.recognition_task_ptr
                } else {
                    None
                }
            };

            let mut loop_count = 0;

            // Run the loop in short intervals so we can check should_stop
            loop {
                // Run loop for 0.5 seconds (reduced frequency)
                let date_class = Class::get("NSDate").unwrap();
                let date: cocoa::base::id = msg_send![date_class, dateWithTimeIntervalSinceNow: 0.5f64];
                let _: () = msg_send![current_run_loop, runUntilDate: date];

                loop_count += 1;

                // Check task state every 6 iterations (~3 seconds)
                if loop_count % 6 == 0 {
                    if let Some(ptr) = task_ptr {
                        let task = ptr as cocoa::base::id;
                        let task_state: i64 = msg_send![task, state];
                        println!("[Speech Native] RunLoop check ({}s) - Task state: {}", loop_count / 2, task_state);

                        // Check for task error
                        let task_error: cocoa::base::id = msg_send![task, error];
                        if task_error != cocoa::base::nil {
                            let desc: cocoa::base::id = msg_send![task_error, localizedDescription];
                            let c_str: *const i8 = msg_send![desc, UTF8String];
                            let error_msg = std::ffi::CStr::from_ptr(c_str).to_string_lossy().into_owned();
                            println!("[Speech Native] Task error detected: {}", error_msg);
                        }
                    }
                }

                // Check if we should stop
                let should_stop = {
                    if let Ok(state) = RECOGNITION_STATE.lock() {
                        state.should_stop
                    } else {
                        true
                    }
                };

                if should_stop {
                    println!("[Speech Native] Stop signal received, exiting RunLoop");
                    break;
                }
            }

            let _ = pool;
        }

        // Update state
        if let Ok(mut state) = RECOGNITION_STATE.lock() {
            state.is_listening = false;
        }
    });

    Ok(())
}

/// Stop speech recognition
#[tauri::command]
pub async fn speech_stop_recognition() -> Result<(), String> {
    println!("[Speech Native] Stopping recognition...");

    stop_native_recognition();

    println!("[Speech Native] Recognition stopped");

    Ok(())
}

/// Check if currently listening
#[tauri::command]
pub async fn speech_is_listening() -> Result<bool, String> {
    let state = RECOGNITION_STATE.lock().unwrap();
    Ok(state.is_listening)
}

// Native macOS implementation using Speech Framework
#[cfg(target_os = "macos")]
fn start_native_recognition(app: tauri::AppHandle, language: String) -> Result<(), String> {
    use cocoa::base::{id, nil};
    use cocoa::foundation::{NSAutoreleasePool, NSString};
    use objc::runtime::Class;
    use objc::{msg_send, sel, sel_impl};

    unsafe {
        let pool = NSAutoreleasePool::new(nil);

        // Check if SFSpeechRecognizer is available
        let sf_speech_class = Class::get("SFSpeechRecognizer");
        if sf_speech_class.is_none() {
            let _ = pool;
            return Err("Speech Framework not available (requires macOS 10.15+)".to_string());
        }

        // Create locale from language string
        // TEMPORARY: Force en-US to test if zh-CN is the issue
        let test_language = "en-US";
        println!("[Speech Native] Testing with locale: {} (forced en-US for debugging, originally: {})", test_language, language);

        let locale_class = Class::get("NSLocale").unwrap();
        let locale_str = NSString::alloc(nil).init_str(test_language);
        let locale: id = msg_send![locale_class, localeWithLocaleIdentifier: locale_str];

        // Create SFSpeechRecognizer with locale
        let recognizer_class = sf_speech_class.unwrap();
        let recognizer: id = msg_send![recognizer_class, alloc];
        let recognizer: id = msg_send![recognizer, initWithLocale: locale];

        if recognizer == nil {
            let _ = pool;
            return Err("Failed to create speech recognizer".to_string());
        }

        // Check if recognizer is available
        let is_available: bool = msg_send![recognizer, isAvailable];
        println!("[Speech Native] Recognizer available: {}", is_available);
        if !is_available {
            let _ = pool;
            return Err("Speech recognizer is not available for this locale".to_string());
        }

        // Request authorization
        let auth_status: i64 = msg_send![recognizer_class, authorizationStatus];

        // 0 = notDetermined, 1 = denied, 2 = restricted, 3 = authorized
        println!("[Speech Native] Authorization status: {} (0=notDetermined, 1=denied, 2=restricted, 3=authorized)", auth_status);

        if auth_status == 1 {
            let _ = pool;
            return Err("Speech recognition permission denied. Please allow in System Settings.".to_string());
        }

        if auth_status != 3 {
            // Request authorization
            println!("[Speech Native] Requesting authorization...");
            request_speech_authorization(app.clone());
            let _ = pool;
            return Err("Speech recognition permission required. Please allow when prompted.".to_string());
        }

        println!("[Speech Native] Authorization granted");

        // Create recognition request
        let request_class = Class::get("SFSpeechAudioBufferRecognitionRequest").unwrap();
        let request: id = msg_send![request_class, new];

        if request == nil {
            let _ = pool;
            return Err("Failed to create recognition request".to_string());
        }

        // Configure request for partial results
        let _: () = msg_send![request, setShouldReportPartialResults: true];

        // Retain request to prevent deallocation
        let _: () = msg_send![request, retain];

        // Store request pointer for later endAudio call
        if let Ok(mut state) = RECOGNITION_STATE.lock() {
            state.recognition_request_ptr = Some(request as usize);
            println!("[Speech Native] Recognition request pointer stored: {:p}", request);
        }

        // Start audio engine and recognition
        // This is a simplified version - full implementation would need audio capture
        start_audio_capture_and_recognition(app, recognizer, request);

        let _ = pool;
    }

    Ok(())
}

#[cfg(target_os = "macos")]
fn request_speech_authorization(_app: tauri::AppHandle) {
    use cocoa::base::nil;
    use objc::runtime::Class;
    use objc::{msg_send, sel, sel_impl};

    unsafe {
        let recognizer_class = Class::get("SFSpeechRecognizer").unwrap();

        // Request authorization with completion handler
        // Note: This requires setting up a block callback
        let _: () = msg_send![recognizer_class, requestAuthorization:nil];
    }
}

#[cfg(target_os = "macos")]
fn start_audio_capture_and_recognition(app: tauri::AppHandle, recognizer: cocoa::base::id, request: cocoa::base::id) {
    use cocoa::base::{id, nil};
    use cocoa::foundation::NSAutoreleasePool;
    use objc::runtime::Class;
    use objc::{msg_send, sel, sel_impl};
    use block::ConcreteBlock;

    unsafe {
        let pool = NSAutoreleasePool::new(nil);

        // Note: Microphone permission will be requested automatically when audio engine starts
        // If permission is denied, the audio engine will fail to start with an error
        println!("[Speech Native] Starting audio capture (will request mic permission if needed)...");

        // Create AVAudioEngine
        let audio_engine_class = Class::get("AVAudioEngine");
        if audio_engine_class.is_none() {
            let _ = pool;
            let _ = app.emit("speech-error", SpeechRecognitionError {
                error: "audio-engine-unavailable".to_string(),
                message: "AVAudioEngine not available".to_string(),
            });
            return;
        }

        let audio_engine: id = msg_send![audio_engine_class.unwrap(), new];
        if audio_engine == nil {
            let _ = pool;
            let _ = app.emit("speech-error", SpeechRecognitionError {
                error: "audio-engine-creation-failed".to_string(),
                message: "Failed to create AVAudioEngine".to_string(),
            });
            return;
        }

        // Retain audio engine to prevent deallocation
        let _: () = msg_send![audio_engine, retain];

        // Store audio engine pointer in global state for cleanup
        if let Ok(mut state) = RECOGNITION_STATE.lock() {
            state.audio_engine_ptr = Some(audio_engine as usize);
            state.should_stop = false;
            println!("[Speech Native] Audio engine pointer stored: {:p}", audio_engine);
        } else {
            println!("[Speech Native] Failed to store audio engine pointer");
        }

        // Get input node
        let input_node: id = msg_send![audio_engine, inputNode];
        if input_node == nil {
            let _ = pool;
            let _ = app.emit("speech-error", SpeechRecognitionError {
                error: "input-node-unavailable".to_string(),
                message: "No audio input available".to_string(),
            });
            return;
        }

        println!("[Speech Native] Input node: {:p}", input_node);

        // Get recording format
        let output_format: id = msg_send![input_node, outputFormatForBus: 0];
        if output_format == nil {
            let _ = pool;
            let _ = app.emit("speech-error", SpeechRecognitionError {
                error: "format-unavailable".to_string(),
                message: "Audio format not available".to_string(),
            });
            return;
        }

        let sample_rate: f64 = msg_send![output_format, sampleRate];
        let channel_count: u32 = msg_send![output_format, channelCount];
        println!("[Speech Native] Audio format - Sample rate: {} Hz, Channels: {}", sample_rate, channel_count);

        // Speech Recognition typically requires 16000 Hz sample rate
        // If the format is different, we might need to convert
        if sample_rate != 16000.0 && sample_rate != 44100.0 && sample_rate != 48000.0 {
            println!("[Speech Native] Warning: Unusual sample rate. Speech Recognition works best with 16kHz.");
        }

        // Clone app handle for the block
        let app_clone = app.clone();
        let recognizer_clone = recognizer;
        let request_clone = request;

        // Start recognition task with result handler FIRST (before audio engine)
        let result_app = app_clone.clone();

        static RESULT_CALLBACK_COUNT: AtomicU32 = AtomicU32::new(0);

        let result_block = ConcreteBlock::new(move |result: id, error: id| {
            let count = RESULT_CALLBACK_COUNT.fetch_add(1, Ordering::Relaxed);
            println!("[Speech Native] Result handler called (count: {})", count);

            // Check if we should stop (user cancelled)
            let should_stop = {
                if let Ok(state) = RECOGNITION_STATE.lock() {
                    state.should_stop
                } else {
                    false
                }
            };

            if should_stop {
                println!("[Speech Native] Result handler: stopping due to cancellation");
                return;
            }

            if error != nil {
                let desc: id = msg_send![error, localizedDescription];
                let c_str: *const i8 = msg_send![desc, UTF8String];
                let error_msg = std::ffi::CStr::from_ptr(c_str).to_string_lossy().into_owned();

                // Check if error is due to cancellation
                if error_msg.contains("cancelled") || error_msg.contains("canceled") {
                    println!("[Speech Native] Recognition cancelled by user");
                    return;
                }

                println!("[Speech Native] Recognition error: {}", error_msg);

                let _ = result_app.emit("speech-error", SpeechRecognitionError {
                    error: "recognition-error".to_string(),
                    message: error_msg,
                });

                // Stop recognition on error
                stop_native_recognition();
                return;
            }

            if result == nil {
                println!("[Speech Native] Result handler called but result is nil (error also nil)");
                return;
            }

            println!("[Speech Native] Result object is valid, getting transcription...");

            // Get best transcription
            let best_transcription: id = msg_send![result, bestTranscription];
            if best_transcription == nil {
                println!("[Speech Native] No transcription available");
                return;
            }

            println!("[Speech Native] Best transcription obtained");

            let formatted_string: id = msg_send![best_transcription, formattedString];
            if formatted_string == nil {
                println!("[Speech Native] No formatted string available");
                return;
            }

            let c_str: *const i8 = msg_send![formatted_string, UTF8String];
            let text = std::ffi::CStr::from_ptr(c_str).to_string_lossy().into_owned();

            // Check if this is a final result
            let is_final: bool = msg_send![result, isFinal];

            println!("[Speech Native] Recognized: '{}' (final: {})", text, is_final);

            let _ = result_app.emit("speech-result", SpeechRecognitionResult {
                text,
                is_final,
            });

            // If final, recognition will continue for next utterance
            // User must call stop explicitly to end the session
        });
        let result_block = result_block.copy();

        // Start recognition task (this starts listening for audio data)
        println!("[Speech Native] Creating recognition task with request and result handler...");
        let task: id = msg_send![recognizer_clone, recognitionTaskWithRequest:request_clone resultHandler:result_block];

        if task == nil {
            let _ = pool;
            let _ = app.emit("speech-error", SpeechRecognitionError {
                error: "task-creation-failed".to_string(),
                message: "Failed to create recognition task".to_string(),
            });
            return;
        }

        println!("[Speech Native] Recognition task created: {:p}", task);

        // Check task state
        let task_state: i64 = msg_send![task, state];
        println!("[Speech Native] Task state: {} (0=starting, 1=running, 2=finishing, 3=canceling, 4=completed)", task_state);

        // Check if task is finishing or cancelled immediately
        let is_finishing: bool = msg_send![task, isFinishing];
        let is_cancelled: bool = msg_send![task, isCancelled];
        println!("[Speech Native] Task isFinishing: {}, isCancelled: {}", is_finishing, is_cancelled);

        // Try to check request state
        println!("[Speech Native] Request object: {:p}", request_clone);

        // Check if we need to explicitly start something
        // For SFSpeechAudioBufferRecognitionRequest, the task should start automatically
        // But let's verify the request is properly configured
        let should_report_partial: bool = msg_send![request_clone, shouldReportPartialResults];
        println!("[Speech Native] Request shouldReportPartialResults: {}", should_report_partial);

        // Retain task to prevent deallocation
        let _: () = msg_send![task, retain];

        // Store task pointer in global state for cancellation
        if let Ok(mut state) = RECOGNITION_STATE.lock() {
            state.recognition_task_ptr = Some(task as usize);
            println!("[Speech Native] Recognition task pointer stored: {:p}", task);
        } else {
            println!("[Speech Native] Failed to store recognition task pointer");
        }

        println!("[Speech Native] Recognition task started successfully");

        // Important: Create and start audio engine FIRST, then task will start processing
        // The task needs actual audio data to transition from starting to running state

        // Create tap on input node to capture audio
        use std::sync::atomic::{AtomicU32, Ordering};
        static BUFFER_COUNT: AtomicU32 = AtomicU32::new(0);

        let tap_block = ConcreteBlock::new(move |buffer: id, _when: id| {
            // Check if buffer is valid
            if buffer != nil {
                // Append audio buffer to recognition request
                let _: () = msg_send![request_clone, appendAudioPCMBuffer: buffer];
                // Print once every ~500 buffers to reduce spam
                let count = BUFFER_COUNT.fetch_add(1, Ordering::Relaxed);
                if count % 500 == 0 {
                    println!("[Speech Native] Audio buffer {} sent to recognition", count);
                }
            }
        });
        let tap_block = tap_block.copy();

        println!("[Speech Native] Installing audio tap...");
        let _: () = msg_send![input_node, installTapOnBus:0 bufferSize:1024 format:output_format block:tap_block];
        println!("[Speech Native] Audio tap installed");

        // Prepare and start audio engine
        let mut error: id = nil;
        let _: () = msg_send![audio_engine, prepare];
        let success: bool = msg_send![audio_engine, startAndReturnError: &mut error];

        if !success || error != nil {
            let _ = pool;
            let error_msg = if error != nil {
                let desc: id = msg_send![error, localizedDescription];
                let c_str: *const i8 = msg_send![desc, UTF8String];
                std::ffi::CStr::from_ptr(c_str).to_string_lossy().into_owned()
            } else {
                "Unknown error starting audio engine".to_string()
            };

            println!("[Speech Native] Audio engine start failed: {}", error_msg);

            let _ = app.emit("speech-error", SpeechRecognitionError {
                error: "audio-engine-start-failed".to_string(),
                message: error_msg,
            });
            return;
        }

        println!("[Speech Native] Audio engine started, listening for speech...");

        let _ = pool;
    }
}

#[cfg(target_os = "macos")]
fn cleanup_audio_engine(audio_engine: cocoa::base::id) {
    use cocoa::base::nil;
    use objc::{msg_send, sel, sel_impl};

    unsafe {
        // Stop audio engine
        let is_running: bool = msg_send![audio_engine, isRunning];
        if is_running {
            let _: () = msg_send![audio_engine, stop];
        }

        // Remove tap from input node
        let input_node: cocoa::base::id = msg_send![audio_engine, inputNode];
        if input_node != nil {
            let _: () = msg_send![input_node, removeTapOnBus: 0];
        }

        // Release the audio engine
        let _: () = msg_send![audio_engine, release];
    }
}

#[cfg(target_os = "macos")]
fn stop_native_recognition() {
    use objc::{msg_send, sel, sel_impl};

    unsafe {
        if let Ok(mut state) = RECOGNITION_STATE.lock() {
            println!("[Speech Native] Lock acquired in stop_native_recognition");
            println!("[Speech Native] task_ptr present: {}, engine_ptr present: {}",
                state.recognition_task_ptr.is_some(),
                state.audio_engine_ptr.is_some());

            state.should_stop = true;
            state.is_listening = false;

            // First, stop audio engine to stop sending new buffers
            if let Some(engine_ptr) = state.audio_engine_ptr.take() {
                println!("[Speech Native] Stopping audio engine...");
                let audio_engine = engine_ptr as cocoa::base::id;
                cleanup_audio_engine(audio_engine);
                println!("[Speech Native] Audio engine stopped");
            } else {
                println!("[Speech Native] No audio engine to stop");
            }

            // End audio on recognition request (this triggers final results)
            if let Some(request_ptr) = state.recognition_request_ptr.take() {
                println!("[Speech Native] Ending audio on recognition request...");
                let request = request_ptr as cocoa::base::id;
                let _: () = msg_send![request, endAudio];
                let _: () = msg_send![request, release];
                println!("[Speech Native] Audio ended on request");
            } else {
                println!("[Speech Native] No recognition request to end");
            }

            // Cancel recognition task if it exists
            if let Some(task_ptr) = state.recognition_task_ptr.take() {
                println!("[Speech Native] Cancelling recognition task...");
                let task = task_ptr as cocoa::base::id;

                // Cancel the task
                let _: () = msg_send![task, cancel];

                // Release the task
                let _: () = msg_send![task, release];
                println!("[Speech Native] Recognition task cancelled");
            } else {
                println!("[Speech Native] No recognition task to cancel");
            }
        } else {
            println!("[Speech Native] Failed to acquire lock in stop_native_recognition");
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn start_native_recognition(_app: tauri::AppHandle, _language: String) -> Result<(), String> {
    Err("Native speech recognition only available on macOS".to_string())
}

#[cfg(not(target_os = "macos"))]
fn stop_native_recognition() {}
