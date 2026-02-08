//! 语音识别引擎模块
//!
//! 使用 sherpa-onnx 进行实时流式语音识别
//!
//! # 模块结构
//!
//! - `types`: 类型定义（识别结果、配置等）
//! - `model`: 模型管理（加载、卸载）
//! - `recognizer`: 流式识别器
//! - `engine`: ASR 引擎（高层接口）
//! - `pipeline`: ASR 管道（集成 VAD 和重采样）
//!
//! # 使用示例
//!
//! ```ignore
//! use lazyaudio_core_lib::asr::{AsrEngine, AsrConfig};
//!
//! // 创建引擎
//! let mut engine = AsrEngine::with_defaults(models_dir);
//!
//! // 加载模型
//! engine.load_model("sherpa-onnx-streaming-zipformer-zh-14M-2023-02-23")?;
//!
//! // 创建识别器
//! let mut recognizer = engine.create_recognizer()?;
//!
//! // 处理音频
//! recognizer.accept_waveform(&samples);
//! let result = recognizer.get_result();
//! ```

mod downloader;
mod engine;
mod model;
pub mod multi_pass;
mod pipeline;
pub mod providers;
mod recognizer;
pub mod silero_vad;
mod types;

// 导出类型
pub use downloader::{ModelDownloader, ProgressCallback};
pub use engine::{create_shared_engine, AsrEngine, SharedAsrEngine};
pub use model::{LoadedModel, ModelFiles, ModelManager};
pub use multi_pass::{
    BufferedSegment, MultiPassScheduler, ResultMerger, SchedulerConfig, SegmentBuffer,
    SegmentBufferConfig, Tier2Recognizer,
};
pub use pipeline::{AsrPipeline, AsrPipelineConfig, SyncAsrPipeline};
pub use providers::{DeepgramRecognizer, LocalAsrRecognizer, OpenAiWhisperRecognizer};
pub use recognizer::{BatchRecognizer, StreamingRecognizer};
pub use silero_vad::{SileroVadWrapper, VadConfig, VadSegment, VAD_MODEL_ID};
pub use types::{
    AsrConfig, AsrError, AsrProviderType, AsrRecognizer, AsrResult, DecodingMethod, ModelInfo,
    ModelType, MultiPassResult, RecognitionResult, RecognitionTier, TierVersion, WordTimestamp,
};
