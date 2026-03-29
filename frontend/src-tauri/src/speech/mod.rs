// Speech recognition module
// Using Whisper for cross-platform speech recognition

pub mod whisper;

pub use whisper::{
    speech_check_availability, __cmd__speech_check_availability,
    speech_start_recognition, __cmd__speech_start_recognition,
    speech_stop_recognition, __cmd__speech_stop_recognition,
    speech_is_listening, __cmd__speech_is_listening,
};
