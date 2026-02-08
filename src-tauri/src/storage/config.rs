//! 配置管理模块
//!
//! 处理 `AppConfig` 的读写和迁移

#![allow(clippy::struct_excessive_bools)]
#![allow(clippy::missing_errors_doc)]

use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;
use std::path::PathBuf;

use super::{get_config_path, CURRENT_SCHEMA_VERSION};

// ============================================================================
// 配置类型定义
// ============================================================================

/// 应用全局配置
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    /// Schema 版本号
    pub version: u32,
    /// 通用配置
    pub general: GeneralConfig,
    /// 音频配置
    pub audio: AudioConfig,
    /// ASR 配置
    pub asr: AsrConfig,
    /// AI 配置
    pub ai: AiConfig,
    /// 快捷键配置
    pub hotkeys: HotkeyConfig,
    /// 存储配置
    pub storage: StorageConfig,
    /// 模式特定配置（JSON 字符串）
    #[serde(default)]
    #[specta(skip)]
    pub modes: HashMap<String, serde_json::Value>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            version: CURRENT_SCHEMA_VERSION,
            general: GeneralConfig::default(),
            audio: AudioConfig::default(),
            asr: AsrConfig::default(),
            ai: AiConfig::default(),
            hotkeys: HotkeyConfig::default(),
            storage: StorageConfig::default(),
            modes: HashMap::new(),
        }
    }
}

/// 通用配置
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GeneralConfig {
    /// 界面语言
    pub language: Language,
    /// 主题模式
    pub theme: Theme,
    /// 开机启动
    #[serde(default)]
    pub launch_at_startup: bool,
    /// macOS 菜单栏图标
    #[serde(default = "default_true")]
    pub show_in_menubar: bool,
    /// Windows 托盘图标
    #[serde(default = "default_true")]
    pub show_in_tray: bool,
    /// 最小化到托盘
    #[serde(default = "default_true")]
    pub minimize_to_tray: bool,
}

impl Default for GeneralConfig {
    fn default() -> Self {
        Self {
            language: Language::ZhCn,
            theme: Theme::System,
            launch_at_startup: false,
            show_in_menubar: true,
            show_in_tray: true,
            minimize_to_tray: true,
        }
    }
}

/// 界面语言
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq, Default)]
#[serde(rename_all = "kebab-case")]
pub enum Language {
    #[default]
    ZhCn,
    EnUs,
}

/// 主题模式
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Light,
    Dark,
    #[default]
    System,
}

/// 音频配置
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AudioConfig {
    /// 默认系统音频源 ID
    pub default_system_source: Option<String>,
    /// 默认麦克风 ID
    pub default_microphone: Option<String>,
    /// 采样率
    #[serde(default = "default_sample_rate")]
    pub sample_rate: u32,
    /// 声道数
    #[serde(default = "default_channels")]
    pub channels: u16,
    /// 输入增益
    #[serde(default = "default_gain")]
    pub input_gain: f32,
}

impl Default for AudioConfig {
    fn default() -> Self {
        Self {
            default_system_source: None,
            default_microphone: None,
            sample_rate: 48000,
            channels: 2,
            input_gain: 1.0,
        }
    }
}

/// ASR 配置
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AsrConfig {
    /// ASR 提供商类型
    #[serde(default)]
    pub provider: AsrProviderType,
    /// 模型 ID（本地模式使用）
    #[serde(default = "default_model_id")]
    pub model_id: String,
    /// 识别语言
    #[serde(default)]
    pub language: AsrLanguage,
    /// 启用标点
    #[serde(default = "default_true")]
    pub enable_punctuation: bool,
    /// VAD 灵敏度
    #[serde(default = "default_vad_sensitivity")]
    pub vad_sensitivity: f32,
    /// OpenAI Whisper 配置
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub openai_whisper: Option<OpenAiWhisperConfig>,
    /// Deepgram 配置
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deepgram: Option<DeepgramConfig>,
    /// Azure Speech 配置
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub azure_speech: Option<AzureSpeechConfig>,
    /// Google Speech 配置
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub google_speech: Option<GoogleSpeechConfig>,
}

impl Default for AsrConfig {
    fn default() -> Self {
        Self {
            provider: AsrProviderType::Local,
            model_id: "sherpa-onnx-streaming-zh-en".to_string(),
            language: AsrLanguage::Auto,
            enable_punctuation: true,
            vad_sensitivity: 0.5,
            openai_whisper: None,
            deepgram: None,
            azure_speech: None,
            google_speech: None,
        }
    }
}

/// ASR 提供商类型（存储层）
///
/// 与 `asr::AsrProviderType` 保持同步，用于配置文件序列化
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum AsrProviderType {
    /// 本地 sherpa-onnx（默认）
    #[default]
    Local,
    /// OpenAI Whisper API
    OpenAiWhisper,
    /// Deepgram
    Deepgram,
    /// Azure Speech
    AzureSpeech,
    /// Google Speech
    GoogleSpeech,
}

impl AsrProviderType {
    /// 获取 Provider 显示名称
    pub fn display_name(&self) -> &'static str {
        match self {
            Self::Local => "本地模型",
            Self::OpenAiWhisper => "OpenAI Whisper",
            Self::Deepgram => "Deepgram",
            Self::AzureSpeech => "Azure Speech",
            Self::GoogleSpeech => "Google Speech",
        }
    }

    /// 是否为本地 Provider
    pub fn is_local(&self) -> bool {
        matches!(self, Self::Local)
    }

    /// 是否为远端 Provider
    pub fn is_remote(&self) -> bool {
        !self.is_local()
    }

    /// 是否支持流式识别（partial results）
    pub fn supports_streaming(&self) -> bool {
        match self {
            Self::Local => true,
            Self::Deepgram => true,
            Self::AzureSpeech => true,
            Self::GoogleSpeech => true,
            Self::OpenAiWhisper => false, // 批量模式，无 partial
        }
    }
}

/// ASR 语言
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum AsrLanguage {
    #[default]
    Auto,
    Zh,
    En,
}

// ============================================================================
// 远端 ASR Provider 配置
// ============================================================================

/// OpenAI Whisper API 配置
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiWhisperConfig {
    /// API Key
    #[serde(default)]
    pub api_key: String,
    /// API 基础 URL（支持兼容接口如 Groq）
    #[serde(default = "default_openai_whisper_base_url")]
    pub base_url: String,
    /// 模型名称
    #[serde(default = "default_openai_whisper_model")]
    pub model: String,
    /// 识别语言（为空时自动检测）
    #[serde(default)]
    pub language: String,
    /// 响应格式
    #[serde(default = "default_whisper_response_format")]
    pub response_format: String,
}

impl Default for OpenAiWhisperConfig {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            base_url: "https://api.openai.com/v1".to_string(),
            model: "whisper-1".to_string(),
            language: String::new(),
            response_format: "verbose_json".to_string(),
        }
    }
}

/// Deepgram 配置
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DeepgramConfig {
    /// API Key
    #[serde(default)]
    pub api_key: String,
    /// WebSocket URL
    #[serde(default = "default_deepgram_base_url")]
    pub base_url: String,
    /// 模型名称
    #[serde(default = "default_deepgram_model")]
    pub model: String,
    /// 识别语言
    #[serde(default)]
    pub language: String,
    /// 智能格式化
    #[serde(default = "default_true")]
    pub smart_format: bool,
    /// 启用标点
    #[serde(default = "default_true")]
    pub punctuate: bool,
    /// 中间结果
    #[serde(default = "default_true")]
    pub interim_results: bool,
}

impl Default for DeepgramConfig {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            base_url: "wss://api.deepgram.com/v1/listen".to_string(),
            model: "nova-2".to_string(),
            language: String::new(),
            smart_format: true,
            punctuate: true,
            interim_results: true,
        }
    }
}

/// Azure Speech 配置
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AzureSpeechConfig {
    /// 订阅 Key
    #[serde(default)]
    pub subscription_key: String,
    /// 服务区域
    #[serde(default)]
    pub region: String,
    /// 识别语言
    #[serde(default)]
    pub language: String,
}

impl Default for AzureSpeechConfig {
    fn default() -> Self {
        Self {
            subscription_key: String::new(),
            region: String::new(),
            language: String::new(),
        }
    }
}

/// Google Speech 配置
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GoogleSpeechConfig {
    /// API Key 或 Service Account JSON 路径
    #[serde(default)]
    pub credentials: String,
    /// 识别语言
    #[serde(default)]
    pub language: String,
    /// 模型
    #[serde(default = "default_google_speech_model")]
    pub model: String,
}

impl Default for GoogleSpeechConfig {
    fn default() -> Self {
        Self {
            credentials: String::new(),
            language: String::new(),
            model: "latest_long".to_string(),
        }
    }
}

/// AI 配置
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AiConfig {
    /// AI 提供商
    pub provider: AiProvider,
    /// `OpenAI` 配置
    pub openai: Option<OpenAiConfig>,
    /// Claude 配置
    pub claude: Option<ClaudeConfig>,
    /// Ollama 配置
    pub ollama: Option<OllamaConfig>,
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            provider: AiProvider::None,
            openai: None,
            claude: None,
            ollama: None,
        }
    }
}

/// AI 提供商
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum AiProvider {
    #[default]
    None,
    #[serde(rename = "openai")]
    OpenAi,
    Claude,
    Ollama,
}

/// `OpenAI` 配置
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiConfig {
    /// API Key（加密存储）
    #[serde(default)]
    pub api_key: String,
    /// API 基础 URL
    #[serde(default = "default_openai_base_url")]
    pub base_url: String,
    /// 模型名称
    #[serde(default = "default_openai_model")]
    pub model: String,
    /// 温度参数
    #[serde(default = "default_temperature")]
    pub temperature: f32,
    /// 最大 Token 数
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
}

impl Default for OpenAiConfig {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            base_url: "https://api.openai.com/v1".to_string(),
            model: "gpt-4o-mini".to_string(),
            temperature: 0.7,
            max_tokens: 4096,
        }
    }
}

/// Claude 配置
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeConfig {
    /// API Key
    #[serde(default)]
    pub api_key: String,
    /// API 基础 URL
    #[serde(default = "default_claude_base_url")]
    pub base_url: String,
    /// 模型名称
    #[serde(default = "default_claude_model")]
    pub model: String,
    /// 温度参数
    #[serde(default = "default_temperature")]
    pub temperature: f32,
    /// 最大 Token 数
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
}

impl Default for ClaudeConfig {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            base_url: "https://api.anthropic.com".to_string(),
            model: "claude-3-5-sonnet-20241022".to_string(),
            temperature: 0.7,
            max_tokens: 4096,
        }
    }
}

/// Ollama 配置
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct OllamaConfig {
    /// API 基础 URL
    #[serde(default = "default_ollama_base_url")]
    pub base_url: String,
    /// 模型名称
    #[serde(default = "default_ollama_model")]
    pub model: String,
    /// 温度参数
    #[serde(default = "default_temperature")]
    pub temperature: f32,
}

impl Default for OllamaConfig {
    fn default() -> Self {
        Self {
            base_url: "http://localhost:11434".to_string(),
            model: "llama3.2".to_string(),
            temperature: 0.7,
        }
    }
}

/// 快捷键配置
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyConfig {
    /// 输入法模式切换
    #[serde(default = "default_input_method_hotkey")]
    pub input_method_toggle: String,
    /// 开始/停止录制
    #[serde(default = "default_start_stop_hotkey")]
    pub start_stop_recording: String,
    /// 暂停/恢复
    #[serde(default = "default_pause_resume_hotkey")]
    pub pause_resume: String,
}

impl Default for HotkeyConfig {
    fn default() -> Self {
        Self {
            input_method_toggle: "CommandOrControl+Shift+Space".to_string(),
            start_stop_recording: "CommandOrControl+Shift+R".to_string(),
            pause_resume: "CommandOrControl+Shift+P".to_string(),
        }
    }
}

/// 存储配置
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct StorageConfig {
    /// 自定义存储路径
    pub base_path: Option<PathBuf>,
    /// 默认保存音频
    #[serde(default = "default_true")]
    pub save_audio_by_default: bool,
    /// 启用自动清理
    #[serde(default)]
    pub auto_cleanup_enabled: bool,
    /// 清理天数
    #[serde(default = "default_cleanup_days")]
    pub cleanup_after_days: u32,
    /// 最大存储空间 (GB)
    #[serde(default = "default_max_storage")]
    pub max_storage_size_gb: f64,
}

impl Default for StorageConfig {
    fn default() -> Self {
        Self {
            base_path: None,
            save_audio_by_default: true,
            auto_cleanup_enabled: false,
            cleanup_after_days: 30,
            max_storage_size_gb: 10.0,
        }
    }
}

// ============================================================================
// 默认值函数
// ============================================================================

fn default_true() -> bool {
    true
}
fn default_sample_rate() -> u32 {
    48000
}
fn default_channels() -> u16 {
    2
}
fn default_gain() -> f32 {
    1.0
}
fn default_model_id() -> String {
    "sherpa-onnx-streaming-zh-en".to_string()
}
fn default_vad_sensitivity() -> f32 {
    0.5
}
// --- 远端 ASR Provider 默认值 ---
fn default_openai_whisper_base_url() -> String {
    "https://api.openai.com/v1".to_string()
}
fn default_openai_whisper_model() -> String {
    "whisper-1".to_string()
}
fn default_whisper_response_format() -> String {
    "verbose_json".to_string()
}
fn default_deepgram_base_url() -> String {
    "wss://api.deepgram.com/v1/listen".to_string()
}
fn default_deepgram_model() -> String {
    "nova-2".to_string()
}
fn default_google_speech_model() -> String {
    "latest_long".to_string()
}
// --- AI Provider 默认值 ---
fn default_openai_base_url() -> String {
    "https://api.openai.com/v1".to_string()
}
fn default_openai_model() -> String {
    "gpt-4o-mini".to_string()
}
fn default_claude_base_url() -> String {
    "https://api.anthropic.com".to_string()
}
fn default_claude_model() -> String {
    "claude-3-5-sonnet-20241022".to_string()
}
fn default_ollama_base_url() -> String {
    "http://localhost:11434".to_string()
}
fn default_ollama_model() -> String {
    "llama3.2".to_string()
}
fn default_temperature() -> f32 {
    0.7
}
fn default_max_tokens() -> u32 {
    4096
}
fn default_input_method_hotkey() -> String {
    "CommandOrControl+Shift+Space".to_string()
}
fn default_start_stop_hotkey() -> String {
    "CommandOrControl+Shift+R".to_string()
}
fn default_pause_resume_hotkey() -> String {
    "CommandOrControl+Shift+P".to_string()
}
fn default_cleanup_days() -> u32 {
    30
}
fn default_max_storage() -> f64 {
    10.0
}

// ============================================================================
// 配置读写
// ============================================================================

/// 加载配置文件
///
/// 如果文件不存在，返回默认配置
#[allow(clippy::cast_possible_truncation)]
pub fn load_config() -> anyhow::Result<AppConfig> {
    let path = get_config_path()?;

    if !path.exists() {
        tracing::info!("配置文件不存在，使用默认配置");
        return Ok(AppConfig::default());
    }

    let content = std::fs::read_to_string(&path)?;
    let mut config: serde_json::Value = serde_json::from_str(&content)?;

    // 检查版本并迁移
    let version = config
        .get("version")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(1) as u32;

    if version > CURRENT_SCHEMA_VERSION {
        anyhow::bail!(
            "配置文件版本 ({version}) 高于当前支持的版本 ({CURRENT_SCHEMA_VERSION})"
        );
    }

    if version < CURRENT_SCHEMA_VERSION {
        migrate_config(&mut config, version, CURRENT_SCHEMA_VERSION);
    }

    let config: AppConfig = serde_json::from_value(config)?;
    Ok(config)
}

/// 保存配置文件到磁盘
pub fn save_config(config: &AppConfig) -> anyhow::Result<()> {
    let path = get_config_path()?;

    // 确保目录存在
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)?;
        }
    }

    let content = serde_json::to_string_pretty(config)?;
    std::fs::write(&path, content)?;

    tracing::info!("配置已保存到: {}", path.display());
    Ok(())
}

/// 迁移配置
fn migrate_config(config: &mut serde_json::Value, from_version: u32, to_version: u32) {
    tracing::info!("迁移配置: v{from_version} -> v{to_version}");

    // 目前只有 v1，暂无迁移逻辑
    // 后续版本添加迁移逻辑

    config["version"] = serde_json::json!(to_version);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = AppConfig::default();
        assert_eq!(config.version, CURRENT_SCHEMA_VERSION);
        assert_eq!(config.general.language, Language::ZhCn);
        assert_eq!(config.general.theme, Theme::System);
    }

    #[test]
    fn test_config_serialize() {
        let config = AppConfig::default();
        let json = serde_json::to_string_pretty(&config).unwrap();
        assert!(json.contains("\"version\""));
        assert!(json.contains("\"general\""));
    }
}

