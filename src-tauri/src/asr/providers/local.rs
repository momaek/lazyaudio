//! 本地 ASR Provider
//!
//! 基于 sherpa-onnx 的本地流式语音识别，封装 `StreamingRecognizer` 为 `AsrRecognizer` trait 实现

use crate::asr::recognizer::StreamingRecognizer;
use crate::asr::types::{AsrProviderType, AsrRecognizer, AsrResult, RecognitionResult};

/// 本地 ASR 识别器
///
/// 包装 sherpa-onnx `StreamingRecognizer`，实现 `AsrRecognizer` trait
pub struct LocalAsrRecognizer {
    inner: StreamingRecognizer,
}

impl LocalAsrRecognizer {
    /// 从 `StreamingRecognizer` 创建
    pub fn new(recognizer: StreamingRecognizer) -> Self {
        Self { inner: recognizer }
    }

    /// 获取内部 `StreamingRecognizer` 的引用
    pub fn inner(&self) -> &StreamingRecognizer {
        &self.inner
    }

    /// 获取内部 `StreamingRecognizer` 的可变引用
    pub fn inner_mut(&mut self) -> &mut StreamingRecognizer {
        &mut self.inner
    }
}

impl AsrRecognizer for LocalAsrRecognizer {
    fn accept_waveform(&mut self, samples: &[f32]) -> AsrResult<()> {
        self.inner.accept_waveform(samples);
        Ok(())
    }

    fn get_result(&mut self) -> AsrResult<RecognitionResult> {
        Ok(self.inner.get_result())
    }

    fn is_endpoint(&self) -> bool {
        self.inner.is_endpoint()
    }

    fn finalize(&mut self) -> AsrResult<RecognitionResult> {
        Ok(self.inner.finalize())
    }

    fn reset(&mut self) {
        self.inner.reset();
    }

    fn full_reset(&mut self) {
        self.inner.full_reset();
    }

    fn processed_duration_secs(&self) -> f64 {
        self.inner.processed_duration_secs()
    }

    fn provider_type(&self) -> AsrProviderType {
        AsrProviderType::Local
    }
}
