//! 事件类型定义模块
//!
//! 定义所有应用事件类型和对应的 Payload

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::storage::TranscriptSegment;

// ============================================================================
// 事件主枚举
// ============================================================================

/// 应用事件类型
///
/// 所有后端到前端的事件通信都使用此枚举
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "type", content = "payload", rename_all = "camelCase")]
pub enum AppEvent {
    // ======== Session 事件 ========
    /// Session 已创建
    SessionCreated(SessionCreatedPayload),
    /// Session 已开始录制
    SessionStarted(SessionIdPayload),
    /// Session 已暂停
    SessionPaused(SessionIdPayload),
    /// Session 已恢复
    SessionResumed(SessionIdPayload),
    /// Session 已结束
    SessionEnded(SessionIdPayload),
    /// Session 发生错误
    SessionError(SessionErrorPayload),

    // ======== 转录事件 ========
    /// 实时转录（临时结果）
    TranscriptPartial(TranscriptPartialPayload),
    /// 最终转录结果（Tier 1）
    TranscriptFinal(TranscriptFinalPayload),
    /// 转录结果更新（Tier 2/3 multi-pass）
    TranscriptUpdated(TranscriptUpdatedPayload),

    // ======== 音频事件 ========
    /// 音频电平更新
    AudioLevel(AudioLevelPayload),
    /// 语音活动检测
    VoiceActivity(VoiceActivityPayload),

    // ======== 麦克风事件 ========
    /// 麦克风已获取
    MicrophoneAcquired(SessionIdPayload),
    /// 麦克风已释放
    MicrophoneReleased(SessionIdPayload),
    /// 麦克风被抢占
    MicrophonePreempted(MicrophonePreemptedPayload),

    // ======== 模式事件 ========
    /// 模式已激活
    ModeActivated(ModeIdPayload),
    /// 模式已停用
    ModeDeactivated(ModeIdPayload),

    // ======== AI 事件 ========
    /// AI 任务已创建
    AiTaskCreated(TaskIdPayload),
    /// AI 任务进度更新
    AiTaskProgress(AiTaskProgressPayload),
    /// AI 任务已完成
    AiTaskCompleted(AiTaskCompletedPayload),
    /// AI 任务失败
    AiTaskFailed(AiTaskFailedPayload),

    // ======== ASR 事件 ========
    /// ASR Provider 降级（远端失败，自动切换到本地）
    AsrFallback(AsrFallbackPayload),

    // ======== 权限事件 ========
    /// 权限状态变更
    PermissionChanged(PermissionChangedPayload),

    // ======== 输入法事件 ========
    /// 输入法模式激活
    InputMethodActivated(EmptyPayload),
    /// 输入法文本变更
    InputMethodTextChanged(TextPayload),
    /// 输入法确认输入
    InputMethodConfirmed(TextPayload),
    /// 输入法取消
    InputMethodCancelled(EmptyPayload),
}

impl AppEvent {
    /// 获取事件类型名称（用于 Tauri emit）
    #[must_use]
    pub fn event_name(&self) -> &'static str {
        match self {
            Self::SessionCreated(_) => "session:created",
            Self::SessionStarted(_) => "session:started",
            Self::SessionPaused(_) => "session:paused",
            Self::SessionResumed(_) => "session:resumed",
            Self::SessionEnded(_) => "session:ended",
            Self::SessionError(_) => "session:error",
            Self::TranscriptPartial(_) => "transcript:partial",
            Self::TranscriptFinal(_) => "transcript:final",
            Self::TranscriptUpdated(_) => "transcript:updated",
            Self::AudioLevel(_) => "audio:level",
            Self::VoiceActivity(_) => "audio:voice-activity",
            Self::MicrophoneAcquired(_) => "microphone:acquired",
            Self::MicrophoneReleased(_) => "microphone:released",
            Self::MicrophonePreempted(_) => "microphone:preempted",
            Self::ModeActivated(_) => "mode:activated",
            Self::ModeDeactivated(_) => "mode:deactivated",
            Self::AiTaskCreated(_) => "ai:task:created",
            Self::AiTaskProgress(_) => "ai:task:progress",
            Self::AiTaskCompleted(_) => "ai:task:completed",
            Self::AiTaskFailed(_) => "ai:task:failed",
            Self::AsrFallback(_) => "asr:fallback",
            Self::PermissionChanged(_) => "permission:changed",
            Self::InputMethodActivated(_) => "input-method:activated",
            Self::InputMethodTextChanged(_) => "input-method:text-changed",
            Self::InputMethodConfirmed(_) => "input-method:confirmed",
            Self::InputMethodCancelled(_) => "input-method:cancelled",
        }
    }

    /// 获取关联的 Session ID（如果有）
    #[must_use]
    pub fn session_id(&self) -> Option<&str> {
        match self {
            Self::SessionCreated(p) => Some(&p.session_id),
            Self::SessionStarted(p)
            | Self::SessionPaused(p)
            | Self::SessionResumed(p)
            | Self::SessionEnded(p)
            | Self::MicrophoneAcquired(p)
            | Self::MicrophoneReleased(p) => Some(&p.session_id),
            Self::SessionError(p) => Some(&p.session_id),
            Self::TranscriptPartial(p) => Some(&p.session_id),
            Self::TranscriptFinal(p) => Some(&p.session_id),
            Self::TranscriptUpdated(p) => Some(&p.session_id),
            Self::AudioLevel(p) => Some(&p.session_id),
            Self::VoiceActivity(p) => Some(&p.session_id),
            Self::MicrophonePreempted(p) => Some(&p.session_id),
            Self::AsrFallback(p) => Some(&p.session_id),
            _ => None,
        }
    }
}

// ============================================================================
// Session Payloads
// ============================================================================

/// Session ID 通用 Payload
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SessionIdPayload {
    /// Session ID
    pub session_id: String,
}

impl SessionIdPayload {
    /// 创建新的 SessionIdPayload
    #[must_use]
    pub fn new(session_id: impl Into<String>) -> Self {
        Self {
            session_id: session_id.into(),
        }
    }
}

/// Session 创建事件 Payload
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SessionCreatedPayload {
    /// Session ID
    pub session_id: String,
    /// 模式 ID
    pub mode_id: String,
    /// 创建时间（ISO 8601）
    pub created_at: String,
}

/// Session 错误事件 Payload
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SessionErrorPayload {
    /// Session ID
    pub session_id: String,
    /// 错误信息
    pub error: String,
}

// ============================================================================
// Transcript Payloads
// ============================================================================

/// 实时转录 Payload
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptPartialPayload {
    /// Session ID
    pub session_id: String,
    /// 临时转录文本
    pub text: String,
    /// 开始时间（秒）
    pub start_time: f64,
    /// 结束时间（秒）
    pub end_time: f64,
    /// 置信度（可选）
    #[serde(default)]
    pub confidence: Option<f32>,
}

/// 最终转录 Payload
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptFinalPayload {
    /// Session ID
    pub session_id: String,
    /// 转录分段
    pub segment: TranscriptSegment,
}

/// 转录更新 Payload（Multi-pass Tier 2/3）
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptUpdatedPayload {
    /// Session ID
    pub session_id: String,
    /// 段落 ID（用于定位需要更新的段落）
    pub segment_id: String,
    /// 识别层级（tier1, tier2, tier3）
    pub tier: String,
    /// 更新后的文本
    pub text: String,
    /// 更新后的置信度
    pub confidence: f32,
    /// 完整的段落数据（包含版本历史）
    pub segment: TranscriptSegment,
}

// ============================================================================
// Audio Payloads
// ============================================================================

/// 音频电平 Payload
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AudioLevelPayload {
    /// Session ID
    pub session_id: String,
    /// 音量电平 (0.0 - 1.0)
    pub level: f32,
    /// 分贝值
    pub db: f32,
}

/// 语音活动检测 Payload
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct VoiceActivityPayload {
    /// Session ID
    pub session_id: String,
    /// 是否正在说话
    pub is_speaking: bool,
}

// ============================================================================
// Microphone Payloads
// ============================================================================

/// 麦克风抢占 Payload
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct MicrophonePreemptedPayload {
    /// 被抢占的 Session ID
    pub session_id: String,
    /// 抢占者的 Session ID
    pub preempted_by: String,
}

// ============================================================================
// Mode Payloads
// ============================================================================

/// 模式 ID Payload
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ModeIdPayload {
    /// 模式 ID
    pub mode_id: String,
}

impl ModeIdPayload {
    /// 创建新的 ModeIdPayload
    #[must_use]
    pub fn new(mode_id: impl Into<String>) -> Self {
        Self {
            mode_id: mode_id.into(),
        }
    }
}

// ============================================================================
// AI Task Payloads
// ============================================================================

/// 任务 ID Payload
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TaskIdPayload {
    /// 任务 ID
    pub task_id: String,
}

/// AI 任务进度 Payload
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AiTaskProgressPayload {
    /// 任务 ID
    pub task_id: String,
    /// 进度 (0.0 - 1.0)
    pub progress: f32,
    /// 进度信息
    #[serde(default)]
    pub message: Option<String>,
}

/// AI 任务完成 Payload
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AiTaskCompletedPayload {
    /// 任务 ID
    pub task_id: String,
    /// 任务结果（JSON 字符串）
    pub result: String,
}

/// AI 任务失败 Payload
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AiTaskFailedPayload {
    /// 任务 ID
    pub task_id: String,
    /// 错误信息
    pub error: String,
}

// ============================================================================
// ASR Payloads
// ============================================================================

/// ASR Provider 降级 Payload
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AsrFallbackPayload {
    /// Session ID
    pub session_id: String,
    /// 原始 Provider 名称
    pub from_provider: String,
    /// 降级后 Provider 名称
    pub to_provider: String,
    /// 降级原因
    pub reason: String,
}

// ============================================================================
// Permission Payloads
// ============================================================================

/// 权限变更 Payload
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PermissionChangedPayload {
    /// 权限类型
    pub permission: String,
    /// 新状态
    pub status: String,
}

// ============================================================================
// Input Method Payloads
// ============================================================================

/// 空 Payload（用于无数据的事件）
#[derive(Debug, Clone, Default, Serialize, Deserialize, Type)]
pub struct EmptyPayload {}

/// 文本 Payload
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct TextPayload {
    /// 文本内容
    pub text: String,
}

impl TextPayload {
    /// 创建新的 TextPayload
    #[must_use]
    pub fn new(text: impl Into<String>) -> Self {
        Self { text: text.into() }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_event_name() {
        let event = AppEvent::SessionCreated(SessionCreatedPayload {
            session_id: "test".to_string(),
            mode_id: "meeting".to_string(),
            created_at: "2025-01-06T00:00:00Z".to_string(),
        });
        assert_eq!(event.event_name(), "session:created");
    }

    #[test]
    fn test_session_id_extraction() {
        let event = AppEvent::SessionStarted(SessionIdPayload::new("test-123"));
        assert_eq!(event.session_id(), Some("test-123"));

        let event = AppEvent::ModeActivated(ModeIdPayload::new("meeting"));
        assert_eq!(event.session_id(), None);
    }

    #[test]
    fn test_serialize_event() {
        let event = AppEvent::TranscriptPartial(TranscriptPartialPayload {
            session_id: "test".to_string(),
            text: "Hello World".to_string(),
            start_time: 0.0,
            end_time: 1.0,
            confidence: Some(0.95),
        });

        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("transcriptPartial"));
        assert!(json.contains("Hello World"));
    }
}
