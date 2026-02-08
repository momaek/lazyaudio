//! ASR 类型定义模块
//!
//! 定义语音识别相关的类型

use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;

/// 识别结果
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct RecognitionResult {
    /// 识别文本
    pub text: String,
    /// 是否为最终结果（否则为中间结果）
    pub is_final: bool,
    /// 识别置信度 (0.0 - 1.0)
    pub confidence: f32,
    /// 词级时间戳
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub timestamps: Vec<WordTimestamp>,
    /// 语音段落 ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub segment_id: Option<u64>,
    /// 结果时间戳（毫秒）
    pub timestamp_ms: u64,
}

impl RecognitionResult {
    /// 创建空结果
    pub fn empty() -> Self {
        Self {
            text: String::new(),
            is_final: false,
            confidence: 0.0,
            timestamps: Vec::new(),
            segment_id: None,
            timestamp_ms: 0,
        }
    }

    /// 创建中间结果
    pub fn partial(text: String, timestamp_ms: u64) -> Self {
        Self {
            text,
            is_final: false,
            confidence: 0.0,
            timestamps: Vec::new(),
            segment_id: None,
            timestamp_ms,
        }
    }

    /// 创建最终结果
    pub fn final_result(text: String, confidence: f32, timestamp_ms: u64) -> Self {
        Self {
            text,
            is_final: true,
            confidence,
            timestamps: Vec::new(),
            segment_id: None,
            timestamp_ms,
        }
    }

    /// 设置段落 ID
    pub fn with_segment_id(mut self, segment_id: u64) -> Self {
        self.segment_id = Some(segment_id);
        self
    }

    /// 设置时间戳
    pub fn with_timestamps(mut self, timestamps: Vec<WordTimestamp>) -> Self {
        self.timestamps = timestamps;
        self
    }

    /// 是否为空结果
    pub fn is_empty(&self) -> bool {
        self.text.trim().is_empty()
    }
}

/// 词级时间戳
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct WordTimestamp {
    /// 词/字
    pub word: String,
    /// 开始时间（秒）
    pub start: f64,
    /// 结束时间（秒）
    pub end: f64,
    /// 置信度
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f32>,
}

impl WordTimestamp {
    /// 创建新的词时间戳
    pub fn new(word: String, start: f64, end: f64) -> Self {
        Self {
            word,
            start,
            end,
            confidence: None,
        }
    }

    /// 设置置信度
    pub fn with_confidence(mut self, confidence: f32) -> Self {
        self.confidence = Some(confidence);
        self
    }

    /// 获取时长
    pub fn duration(&self) -> f64 {
        self.end - self.start
    }
}

/// ASR 配置
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AsrConfig {
    /// 模型 ID
    pub model_id: String,
    /// 采样率（必须为 16000）
    pub sample_rate: u32,
    /// 是否启用标点符号
    pub enable_punctuation: bool,
    /// 语言代码
    pub language: String,
    /// 解码方法
    pub decoding_method: DecodingMethod,
    /// 线程数
    pub num_threads: u32,
}

impl Default for AsrConfig {
    fn default() -> Self {
        Self {
            model_id: "sherpa-onnx-streaming-zipformer-zh".to_string(),
            sample_rate: 16000,
            enable_punctuation: false,
            language: "zh".to_string(),
            decoding_method: DecodingMethod::Greedy,
            num_threads: 2,
        }
    }
}

/// 解码方法
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, Default)]
#[serde(rename_all = "snake_case")]
pub enum DecodingMethod {
    /// 贪婪解码（最快）
    #[default]
    Greedy,
    /// 修改后的束搜索
    ModifiedBeam,
}

impl DecodingMethod {
    /// 转换为 sherpa 字符串
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Greedy => "greedy_search",
            Self::ModifiedBeam => "modified_beam_search",
        }
    }
}

/// 模型信息
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ModelInfo {
    /// 模型唯一 ID
    pub id: String,
    /// 模型名称（显示用）
    pub name: String,
    /// 支持的语言
    pub language: String,
    /// 模型大小（MB）
    pub size_mb: u64,
    /// 是否已下载
    pub is_downloaded: bool,
    /// 模型类型
    pub model_type: ModelType,
    /// 模型描述
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// 模型类型
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ModelType {
    /// 流式模型（实时转录）
    Streaming,
    /// 非流式模型（离线转录）
    NonStreaming,
    /// VAD 模型（语音活动检测）
    Vad,
}

// ============================================================================
// ASR Provider 抽象
// ============================================================================

// 统一使用 storage::AsrProviderType，避免重复定义
pub use crate::storage::AsrProviderType;

/// ASR 识别器抽象 trait
///
/// 所有识别器（本地 sherpa-onnx、远端流式、远端批量）都实现此 trait。
/// 方法保持同步（非 async），远端 Provider 内部通过 channel + tokio spawn
/// 实现异步网络通信，对外暴露同步接口。
pub trait AsrRecognizer: Send {
    /// 输入音频采样（16kHz 单声道 f32）
    fn accept_waveform(&mut self, samples: &[f32]) -> AsrResult<()>;

    /// 获取当前识别结果（非阻塞，无新结果返回 empty）
    fn get_result(&mut self) -> AsrResult<RecognitionResult>;

    /// 检查是否检测到端点（语句结束）
    fn is_endpoint(&self) -> bool;

    /// 强制获取最终结果
    fn finalize(&mut self) -> AsrResult<RecognitionResult>;

    /// 重置识别器状态（保留内部计数器）
    fn reset(&mut self);

    /// 完全重置（包括内部计数器）
    fn full_reset(&mut self);

    /// 获取已处理的音频时长（秒）
    fn processed_duration_secs(&self) -> f64;

    /// 获取 Provider 类型
    fn provider_type(&self) -> AsrProviderType;

    /// 是否支持流式识别（partial results）
    fn supports_streaming(&self) -> bool {
        self.provider_type().supports_streaming()
    }
}

// ============================================================================
// 错误类型
// ============================================================================

/// ASR 错误类型
#[derive(Debug, thiserror::Error)]
pub enum AsrError {
    /// 模型未找到
    #[error("模型未找到: {0}")]
    ModelNotFound(String),

    /// 模型加载失败
    #[error("模型加载失败: {0}")]
    ModelLoadError(String),

    /// 识别错误
    #[error("识别错误: {0}")]
    RecognitionError(String),

    /// 配置错误
    #[error("配置错误: {0}")]
    ConfigError(String),

    /// IO 错误
    #[error("IO 错误: {0}")]
    IoError(#[from] std::io::Error),

    /// 其他错误
    #[error("{0}")]
    Other(String),
}

/// ASR 结果类型
pub type AsrResult<T> = Result<T, AsrError>;

/// 识别层级枚举
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum RecognitionTier {
    /// Tier 1: 实时流式识别
    Tier1,
    /// Tier 2: 精确离线识别
    Tier2,
    /// Tier 3: 超精确识别（可选）
    Tier3,
}

impl RecognitionTier {
    /// 获取层级名称
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Tier1 => "tier1",
            Self::Tier2 => "tier2",
            Self::Tier3 => "tier3",
        }
    }

    /// 获取层级优先级（数字越大优先级越高）
    pub fn priority(&self) -> u8 {
        match self {
            Self::Tier1 => 1,
            Self::Tier2 => 2,
            Self::Tier3 => 3,
        }
    }
}

/// 层级版本信息
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct TierVersion {
    /// 识别文本
    pub text: String,
    /// 置信度
    pub confidence: f32,
    /// 时间戳（毫秒）
    pub timestamp_ms: u64,
}

/// 多级识别结果
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct MultiPassResult {
    /// 段落 ID
    pub segment_id: u64,
    
    /// 各层级的识别结果
    pub tier_results: HashMap<String, TierVersion>,
    
    /// 当前最佳结果（自动选择最高层级）
    pub best_result: RecognitionResult,
    
    /// 当前使用的层级
    pub current_tier: RecognitionTier,
    
    /// 是否所有启用的层级已完成
    pub is_fully_processed: bool,
    
    /// 创建时间（毫秒）
    pub created_at: u64,
    
    /// 最后更新时间（毫秒）
    pub updated_at: u64,
}

impl MultiPassResult {
    /// 创建新的多级识别结果
    pub fn new(segment_id: u64, tier1_result: RecognitionResult) -> Self {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        let mut tier_results = HashMap::new();
        tier_results.insert(
            "tier1".to_string(),
            TierVersion {
                text: tier1_result.text.clone(),
                confidence: tier1_result.confidence,
                timestamp_ms: now,
            },
        );

        Self {
            segment_id,
            tier_results,
            best_result: tier1_result,
            current_tier: RecognitionTier::Tier1,
            is_fully_processed: false,
            created_at: now,
            updated_at: now,
        }
    }

    /// 更新指定层级的结果
    pub fn update_tier(&mut self, tier: RecognitionTier, result: RecognitionResult) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        self.tier_results.insert(
            tier.as_str().to_string(),
            TierVersion {
                text: result.text.clone(),
                confidence: result.confidence,
                timestamp_ms: now,
            },
        );

        // 如果新层级优先级更高，更新最佳结果
        if tier.priority() > self.current_tier.priority() {
            self.best_result = result;
            self.current_tier = tier;
        }

        self.updated_at = now;
    }

    /// 获取指定层级的结果
    pub fn get_tier_result(&self, tier: RecognitionTier) -> Option<&TierVersion> {
        self.tier_results.get(tier.as_str())
    }
}

