//! 多级识别模块
//!
//! 实现 Multi-pass ASR 架构，提供三级识别：
//! - Tier 1: 实时流式识别（< 300ms）
//! - Tier 2: 精确离线识别（延迟精修，2-5秒后触发）
//! - Tier 3: 超精确识别（30-60秒延迟，可选）
//!
//! ## 延迟精修机制
//!
//! `DelayedRefiner` 实现了基于时间的延迟精修：
//! 1. Tier1 结果产生后立即显示
//! 2. 同时启动独立定时器（默认3秒）
//! 3. 定时器触发后使用 SenseVoice 执行 Tier2 精修
//! 4. 精修结果通过回调通知，前端原地替换文本
//!
//! ## SenseVoice 特点
//!
//! - 离线识别，准确率更高
//! - 自动添加标点符号
//! - 支持 ITN（逆文本归一化）

mod delayed_refiner;
mod result_merger;
mod scheduler;
mod segment_buffer;
mod sense_voice_refiner;
mod tier2_recognizer;

pub use delayed_refiner::{DelayedRefineConfig, DelayedRefiner, RefineCallback, RefineResult};
pub use result_merger::ResultMerger;
pub use scheduler::{MultiPassScheduler, SchedulerConfig};
pub use segment_buffer::{BufferedSegment, SegmentBuffer, SegmentBufferConfig};
pub use sense_voice_refiner::SenseVoiceRefiner;
pub use tier2_recognizer::Tier2Recognizer;

