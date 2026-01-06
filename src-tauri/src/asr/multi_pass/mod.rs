//! 多级识别模块
//!
//! 实现 Multi-pass ASR 架构，提供三级识别：
//! - Tier 1: 实时流式识别（< 300ms）
//! - Tier 2: 精确离线识别（5-10秒延迟）
//! - Tier 3: 超精确识别（30-60秒延迟，可选）

mod result_merger;
mod scheduler;
mod segment_buffer;
mod tier2_recognizer;

pub use result_merger::ResultMerger;
pub use scheduler::{MultiPassScheduler, SchedulerConfig};
pub use segment_buffer::{BufferedSegment, SegmentBuffer, SegmentBufferConfig};
pub use tier2_recognizer::Tier2Recognizer;

