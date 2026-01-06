//! Session 状态机模块
//!
//! 定义 Session 生命周期状态和转换规则

use serde::{Deserialize, Serialize};
use specta::Type;

/// Session 状态
///
/// 定义 Session 的生命周期状态
///
/// # 状态转换图
///
/// ```text
/// ┌─────────┐  start   ┌───────────┐
/// │ Created │ ───────→ │ Recording │
/// └─────────┘          └─────┬─────┘
///                            │
///          ┌─────────────────┼─────────────────┐
///          │                 │                 │
///        pause              stop             error
///          │                 │                 │
///          ▼                 ▼                 ▼
///     ┌─────────┐      ┌───────────┐     ┌─────────┐
///     │ Paused  │      │ Completed │     │  Error  │
///     └────┬────┘      └───────────┘     └─────────┘
///          │
///       resume
///          │
///          └──────────→ Recording
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "type", content = "data", rename_all = "lowercase")]
pub enum SessionState {
    /// 已创建，未开始录制
    Created,
    /// 录制中
    Recording,
    /// 已暂停
    Paused,
    /// 已完成
    Completed,
    /// 错误状态
    Error {
        /// 错误信息
        message: String,
    },
}

impl SessionState {
    /// 检查是否可以转换到目标状态
    ///
    /// # 有效的状态转换
    ///
    /// - `Created` → `Recording`（开始录制）
    /// - `Recording` → `Paused`（暂停）
    /// - `Recording` → `Completed`（停止）
    /// - `Recording` → `Error`（发生错误）
    /// - `Paused` → `Recording`（恢复）
    /// - `Paused` → `Completed`（停止）
    #[must_use]
    pub fn can_transition_to(&self, target: &Self) -> bool {
        matches!(
            (self, target),
            (Self::Created, Self::Recording)
                | (Self::Recording, Self::Paused)
                | (Self::Recording, Self::Completed)
                | (Self::Recording, Self::Error { .. })
                | (Self::Paused, Self::Recording)
                | (Self::Paused, Self::Completed)
        )
    }

    /// 尝试转换到目标状态
    ///
    /// # 返回
    ///
    /// - `Ok(target)` 如果转换有效
    /// - `Err(InvalidTransition)` 如果转换无效
    pub fn transition_to(self, target: Self) -> Result<Self, SessionStateError> {
        if self.can_transition_to(&target) {
            Ok(target)
        } else {
            Err(SessionStateError::InvalidTransition {
                from: self,
                to: target,
            })
        }
    }

    /// 检查是否是活跃状态（可以进行操作）
    #[must_use]
    pub fn is_active(&self) -> bool {
        matches!(self, Self::Created | Self::Recording | Self::Paused)
    }

    /// 检查是否正在录制
    #[must_use]
    pub fn is_recording(&self) -> bool {
        matches!(self, Self::Recording)
    }

    /// 检查是否已暂停
    #[must_use]
    pub fn is_paused(&self) -> bool {
        matches!(self, Self::Paused)
    }

    /// 检查是否已完成
    #[must_use]
    pub fn is_completed(&self) -> bool {
        matches!(self, Self::Completed)
    }

    /// 检查是否处于错误状态
    #[must_use]
    pub fn is_error(&self) -> bool {
        matches!(self, Self::Error { .. })
    }

    /// 检查是否是终态（不能再进行操作）
    #[must_use]
    pub fn is_terminal(&self) -> bool {
        matches!(self, Self::Completed | Self::Error { .. })
    }

    /// 获取状态名称字符串
    #[must_use]
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Created => "created",
            Self::Recording => "recording",
            Self::Paused => "paused",
            Self::Completed => "completed",
            Self::Error { .. } => "error",
        }
    }
}

impl Default for SessionState {
    fn default() -> Self {
        Self::Created
    }
}

impl std::fmt::Display for SessionState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Created => write!(f, "Created"),
            Self::Recording => write!(f, "Recording"),
            Self::Paused => write!(f, "Paused"),
            Self::Completed => write!(f, "Completed"),
            Self::Error { message } => write!(f, "Error: {message}"),
        }
    }
}

/// Session 状态错误
#[derive(Debug, Clone, thiserror::Error)]
pub enum SessionStateError {
    /// 无效的状态转换
    #[error("无效的状态转换: {from} → {to}")]
    InvalidTransition {
        /// 当前状态
        from: SessionState,
        /// 目标状态
        to: SessionState,
    },
}

/// 从存储的 SessionStatus 转换
impl From<crate::storage::SessionStatus> for SessionState {
    fn from(status: crate::storage::SessionStatus) -> Self {
        match status {
            crate::storage::SessionStatus::Created => Self::Created,
            crate::storage::SessionStatus::Recording => Self::Recording,
            crate::storage::SessionStatus::Paused => Self::Paused,
            crate::storage::SessionStatus::Completed => Self::Completed,
            crate::storage::SessionStatus::Error => Self::Error {
                message: "Unknown error".to_string(),
            },
        }
    }
}

/// 转换为存储的 SessionStatus
impl From<&SessionState> for crate::storage::SessionStatus {
    fn from(state: &SessionState) -> Self {
        match state {
            SessionState::Created => Self::Created,
            SessionState::Recording => Self::Recording,
            SessionState::Paused => Self::Paused,
            SessionState::Completed => Self::Completed,
            SessionState::Error { .. } => Self::Error,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_transitions() {
        // Created -> Recording
        assert!(SessionState::Created.can_transition_to(&SessionState::Recording));

        // Recording -> Paused
        assert!(SessionState::Recording.can_transition_to(&SessionState::Paused));

        // Recording -> Completed
        assert!(SessionState::Recording.can_transition_to(&SessionState::Completed));

        // Recording -> Error
        assert!(SessionState::Recording.can_transition_to(&SessionState::Error {
            message: "test".to_string()
        }));

        // Paused -> Recording
        assert!(SessionState::Paused.can_transition_to(&SessionState::Recording));

        // Paused -> Completed
        assert!(SessionState::Paused.can_transition_to(&SessionState::Completed));
    }

    #[test]
    fn test_invalid_transitions() {
        // Created -> Paused (invalid)
        assert!(!SessionState::Created.can_transition_to(&SessionState::Paused));

        // Created -> Completed (invalid)
        assert!(!SessionState::Created.can_transition_to(&SessionState::Completed));

        // Completed -> Recording (invalid)
        assert!(!SessionState::Completed.can_transition_to(&SessionState::Recording));

        // Error -> Recording (invalid)
        assert!(!SessionState::Error {
            message: "test".to_string()
        }
        .can_transition_to(&SessionState::Recording));
    }

    #[test]
    fn test_transition_to() {
        let state = SessionState::Created;
        let result = state.transition_to(SessionState::Recording);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), SessionState::Recording);

        let state = SessionState::Created;
        let result = state.transition_to(SessionState::Completed);
        assert!(result.is_err());
    }

    #[test]
    fn test_state_checks() {
        assert!(SessionState::Created.is_active());
        assert!(SessionState::Recording.is_active());
        assert!(SessionState::Paused.is_active());
        assert!(!SessionState::Completed.is_active());
        assert!(!SessionState::Error {
            message: "test".to_string()
        }
        .is_active());

        assert!(SessionState::Recording.is_recording());
        assert!(!SessionState::Paused.is_recording());

        assert!(SessionState::Completed.is_terminal());
        assert!(SessionState::Error {
            message: "test".to_string()
        }
        .is_terminal());
    }
}

