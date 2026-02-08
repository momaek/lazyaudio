//! ASR Provider 实现模块
//!
//! 提供各种 ASR 识别器的具体实现

mod deepgram;
mod local;
mod openai_whisper;

pub use deepgram::DeepgramRecognizer;
pub use local::LocalAsrRecognizer;
pub use openai_whisper::OpenAiWhisperRecognizer;
