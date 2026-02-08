//! Session 文件存储模块
//!
//! 管理 Session 目录、元数据和转录文件

#![allow(clippy::missing_errors_doc)]

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use uuid::Uuid;

use super::config::AsrProviderType;
use super::get_sessions_dir;

/// 日期时间字符串类型（ISO 8601 格式）
pub type DateTimeString = String;

/// Session 存储管理器
#[derive(Debug)]
pub struct SessionStorage {
    /// Session 目录路径
    pub path: PathBuf,
    /// Session ID
    pub session_id: String,
}

impl SessionStorage {
    /// 创建新的 Session 存储
    pub fn create(session_id: &str, created_at: &str) -> anyhow::Result<Self> {
        let sessions_dir = get_sessions_dir()?;

        // 解析 ISO 8601 时间字符串
        let dir_name = if let Ok(dt) = DateTime::parse_from_rfc3339(created_at) {
            format!("{}_{}", dt.format("%Y%m%d_%H%M%S"), session_id)
        } else {
            format!("{}_{}", Utc::now().format("%Y%m%d_%H%M%S"), session_id)
        };

        let path = sessions_dir.join(&dir_name);

        // 创建目录
        std::fs::create_dir_all(&path)?;

        tracing::info!("创建 Session 目录: {}", path.display());

        Ok(Self {
            path,
            session_id: session_id.to_string(),
        })
    }

    /// 打开已存在的 Session 存储
    pub fn open(directory_path: &str) -> anyhow::Result<Self> {
        let path = PathBuf::from(directory_path);

        if !path.exists() {
            anyhow::bail!("Session 目录不存在: {}", path.display());
        }

        // 从目录名解析 session_id
        let dir_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| anyhow::anyhow!("无效的目录路径"))?;

        let session_id = dir_name
            .split('_')
            .last()
            .ok_or_else(|| anyhow::anyhow!("无法从目录名解析 Session ID"))?
            .to_string();

        Ok(Self { path, session_id })
    }

    /// 获取目录路径字符串
    #[must_use]
    pub fn directory_path(&self) -> String {
        self.path.to_string_lossy().to_string()
    }

    /// 获取元数据文件路径
    #[must_use]
    pub fn meta_path(&self) -> PathBuf {
        self.path.join("meta.json")
    }

    /// 获取音频文件路径
    #[must_use]
    pub fn audio_path(&self) -> PathBuf {
        self.path.join("audio.wav")
    }

    /// 获取转录文件路径
    #[must_use]
    pub fn transcript_path(&self) -> PathBuf {
        self.path.join("transcript.jsonl")
    }

    /// 获取 AI 目录路径
    #[must_use]
    pub fn ai_dir(&self) -> PathBuf {
        self.path.join("ai")
    }

    /// 保存元数据
    pub fn save_meta(&self, meta: &SessionMeta) -> anyhow::Result<()> {
        let path = self.meta_path();
        let content = serde_json::to_string_pretty(meta)?;
        std::fs::write(&path, content)?;
        Ok(())
    }

    /// 加载元数据
    pub fn load_meta(&self) -> anyhow::Result<SessionMeta> {
        let path = self.meta_path();
        let content = std::fs::read_to_string(&path)?;
        let meta: SessionMeta = serde_json::from_str(&content)?;
        Ok(meta)
    }

    /// 追加转录分段
    pub fn append_transcript(&self, segment: &TranscriptSegment) -> anyhow::Result<()> {
        let path = self.transcript_path();

        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)?;

        let line = serde_json::to_string(segment)?;
        writeln!(file, "{line}")?;

        Ok(())
    }

    /// 加载所有转录分段
    pub fn load_transcript(&self) -> anyhow::Result<Vec<TranscriptSegment>> {
        let path = self.transcript_path();

        if !path.exists() {
            return Ok(Vec::new());
        }

        let file = File::open(&path)?;
        let reader = BufReader::new(file);
        let mut segments = Vec::new();

        for line in reader.lines() {
            let line = line?;
            if line.trim().is_empty() {
                continue;
            }
            let segment: TranscriptSegment = serde_json::from_str(&line)?;
            segments.push(segment);
        }

        Ok(segments)
    }

    /// 删除 Session 目录
    pub fn delete(&self) -> anyhow::Result<()> {
        if self.path.exists() {
            std::fs::remove_dir_all(&self.path)?;
            tracing::info!("删除 Session 目录: {}", self.path.display());
        }
        Ok(())
    }
}

// ============================================================================
// Session 元数据类型
// ============================================================================

/// Session 元数据
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SessionMeta {
    /// Session ID
    pub id: String,
    /// Schema 版本
    pub version: u32,
    /// 用户自定义名称
    #[serde(default)]
    pub name: Option<String>,
    /// 所属模式 ID
    pub mode_id: String,
    /// 创建时间（ISO 8601）
    pub created_at: DateTimeString,
    /// 更新时间（ISO 8601）
    pub updated_at: DateTimeString,
    /// 完成时间（ISO 8601）
    #[serde(default)]
    pub completed_at: Option<DateTimeString>,
    /// 状态
    pub status: SessionStatus,
    /// 错误信息
    #[serde(default)]
    pub error: Option<String>,
    /// 音频配置
    pub audio_config: SessionAudioConfig,
    /// 统计信息
    #[serde(default)]
    pub stats: SessionStats,
    /// 模式特定数据（JSON 字符串）
    #[serde(default)]
    #[specta(skip)]
    pub mode_data: serde_json::Value,
    /// 用户标签
    #[serde(default)]
    pub tags: Vec<String>,
    /// 使用的 ASR Provider 类型
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub asr_provider: Option<AsrProviderType>,
    /// 使用的 ASR 模型/服务 ID
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub asr_model: Option<String>,
}

impl SessionMeta {
    /// 创建新的 Session 元数据
    #[must_use]
    pub fn new(mode_id: String, audio_config: SessionAudioConfig) -> Self {
        let now = Utc::now().to_rfc3339();
        Self {
            id: Uuid::new_v4().to_string(),
            version: 1,
            name: None,
            mode_id,
            created_at: now.clone(),
            updated_at: now,
            completed_at: None,
            status: SessionStatus::Created,
            error: None,
            audio_config,
            stats: SessionStats::default(),
            mode_data: serde_json::Value::Null,
            tags: Vec::new(),
            asr_provider: None,
            asr_model: None,
        }
    }

    /// 设置 ASR Provider 信息
    pub fn set_asr_info(&mut self, provider: AsrProviderType, model: Option<String>) {
        self.asr_provider = Some(provider);
        self.asr_model = model;
    }

    /// 生成目录名
    #[must_use]
    pub fn directory_name(&self) -> String {
        // 解析 ISO 8601 时间字符串并格式化
        if let Ok(dt) = DateTime::parse_from_rfc3339(&self.created_at) {
            format!("{}_{}", dt.format("%Y%m%d_%H%M%S"), self.id)
        } else {
            format!("{}_{}", Utc::now().format("%Y%m%d_%H%M%S"), self.id)
        }
    }

    /// 获取创建时间的 `DateTime`
    #[must_use]
    pub fn created_at_datetime(&self) -> Option<DateTime<Utc>> {
        DateTime::parse_from_rfc3339(&self.created_at)
            .ok()
            .map(|dt| dt.with_timezone(&Utc))
    }
}

/// Session 状态
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SessionStatus {
    /// 已创建
    Created,
    /// 录制中
    Recording,
    /// 已暂停
    Paused,
    /// 已完成
    Completed,
    /// 错误
    Error,
}

impl std::fmt::Display for SessionStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Created => write!(f, "created"),
            Self::Recording => write!(f, "recording"),
            Self::Paused => write!(f, "paused"),
            Self::Completed => write!(f, "completed"),
            Self::Error => write!(f, "error"),
        }
    }
}

/// Session 音频配置
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SessionAudioConfig {
    /// 音频源列表
    pub sources: Vec<AudioSourceInfo>,
    /// 采样率
    pub sample_rate: u32,
    /// 声道数
    pub channels: u16,
    /// 是否保存音频
    pub save_audio: bool,
}

impl Default for SessionAudioConfig {
    fn default() -> Self {
        Self {
            sources: Vec::new(),
            sample_rate: 48000,
            channels: 2,
            save_audio: true,
        }
    }
}

/// 音频源信息
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AudioSourceInfo {
    /// 设备 ID
    pub id: String,
    /// 类型
    #[serde(rename = "type")]
    pub source_type: AudioSourceType,
    /// 名称
    pub name: String,
    /// 应用 Bundle ID
    #[serde(default)]
    pub bundle_id: Option<String>,
}

/// 音频源类型
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AudioSourceType {
    /// 系统音频
    System,
    /// 应用音频
    Application,
    /// 麦克风
    Microphone,
}

/// Session 统计信息
#[derive(Debug, Clone, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SessionStats {
    /// 总时长（毫秒）
    #[serde(default)]
    pub duration_ms: u64,
    /// 音频时长（毫秒）
    #[serde(default)]
    pub audio_duration_ms: u64,
    /// 转录段落数
    #[serde(default)]
    pub segment_count: u32,
    /// 总字数
    #[serde(default)]
    pub word_count: u32,
    /// 总字符数
    #[serde(default)]
    pub character_count: u32,
}

// ============================================================================
// 转录分段类型
// ============================================================================

/// 转录分段
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptSegment {
    /// 分段 ID
    pub id: String,
    /// 开始时间（秒）
    pub start_time: f64,
    /// 结束时间（秒）
    pub end_time: f64,
    /// 转录文本
    pub text: String,
    /// 是否为最终结果
    pub is_final: bool,
    /// 置信度
    #[serde(default)]
    pub confidence: Option<f32>,
    /// 音频来源
    #[serde(default)]
    pub source: Option<TranscriptSource>,
    /// 说话人 ID（Speaker Diarization 识别结果）
    #[serde(default)]
    pub speaker_id: Option<String>,
    /// 说话人标签（如 "Speaker 1"、"张三"）
    #[serde(default)]
    pub speaker_label: Option<String>,
    /// 检测到的语言
    #[serde(default)]
    pub language: Option<String>,
    /// 词级时间戳
    #[serde(default)]
    pub words: Option<Vec<WordTimestamp>>,
    /// 创建时间（ISO 8601）
    pub created_at: DateTimeString,
    /// 识别层级（Multi-pass: tier1=实时, tier2=修正, tier3=精修）
    #[serde(default)]
    pub tier: Option<String>,
}

impl TranscriptSegment {
    /// 创建新的转录分段
    #[must_use]
    pub fn new(text: String, start_time: f64, end_time: f64, is_final: bool) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            start_time,
            end_time,
            text,
            is_final,
            confidence: None,
            source: None,
            speaker_id: None,
            speaker_label: None,
            language: None,
            words: None,
            created_at: Utc::now().to_rfc3339(),
            tier: None,
        }
    }

    /// 计算时长（秒）
    #[must_use]
    pub fn duration(&self) -> f64 {
        self.end_time - self.start_time
    }
}

/// 转录来源
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TranscriptSource {
    /// 系统音频
    System,
    /// 麦克风
    Microphone,
    /// 混合
    Mixed,
}

/// 词级时间戳
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct WordTimestamp {
    /// 词
    pub word: String,
    /// 开始时间
    pub start: f64,
    /// 结束时间
    pub end: f64,
    /// 置信度
    #[serde(default)]
    pub confidence: Option<f32>,
}

impl From<crate::asr::WordTimestamp> for WordTimestamp {
    fn from(wt: crate::asr::WordTimestamp) -> Self {
        Self {
            word: wt.word,
            start: wt.start,
            end: wt.end,
            confidence: wt.confidence,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_session_storage_create() {
        // 临时覆盖 sessions 目录
        let dir = tempdir().unwrap();
        let session_id = "test-session";
        let created_at = Utc::now();

        // 手动创建 storage
        let path = dir.path().join(format!(
            "{}_{}",
            created_at.format("%Y%m%d_%H%M%S"),
            session_id
        ));
        std::fs::create_dir_all(&path).unwrap();

        let storage = SessionStorage {
            path: path.clone(),
            session_id: session_id.to_string(),
        };

        assert!(storage.path.exists());
    }

    #[test]
    fn test_meta_save_load() {
        let dir = tempdir().unwrap();
        let storage = SessionStorage {
            path: dir.path().to_path_buf(),
            session_id: "test".to_string(),
        };

        let meta = SessionMeta::new("meeting".to_string(), SessionAudioConfig::default());
        storage.save_meta(&meta).unwrap();

        let loaded = storage.load_meta().unwrap();
        assert_eq!(loaded.mode_id, "meeting");
    }

    #[test]
    fn test_transcript_append_load() {
        let dir = tempdir().unwrap();
        let storage = SessionStorage {
            path: dir.path().to_path_buf(),
            session_id: "test".to_string(),
        };

        let segment1 = TranscriptSegment::new("Hello".to_string(), 0.0, 1.0, true);
        let segment2 = TranscriptSegment::new("World".to_string(), 1.0, 2.0, true);

        storage.append_transcript(&segment1).unwrap();
        storage.append_transcript(&segment2).unwrap();

        let segments = storage.load_transcript().unwrap();
        assert_eq!(segments.len(), 2);
        assert_eq!(segments[0].text, "Hello");
        assert_eq!(segments[1].text, "World");
    }
}

