//! Session 管理器模块
//!
//! 管理所有 Session 的生命周期

use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::Instant;

use chrono::Utc;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

use crate::audio::{AcquireResult, SharedMicrophoneManager};
use crate::event::{
    AppEvent, SessionCreatedPayload, SessionErrorPayload, SessionIdPayload, SharedEventBus,
};
use crate::storage::{AsrProviderType, SessionMeta, SessionStorage, StorageEngine, TranscriptSegment};

use super::state::{SessionState, SessionStateError};
use super::types::{SessionConfig, SessionId, SessionInfo, SessionStatsUpdate};

// ============================================================================
// 错误类型
// ============================================================================

/// Session 管理器错误
#[derive(Debug, thiserror::Error)]
pub enum SessionError {
    /// Session 不存在
    #[error("Session 不存在: {0}")]
    NotFound(SessionId),

    /// Session 已存在
    #[error("Session 已存在: {0}")]
    AlreadyExists(SessionId),

    /// 无效的状态转换
    #[error("无效的状态转换: {0}")]
    InvalidStateTransition(#[from] SessionStateError),

    /// 存储错误
    #[error("存储错误: {0}")]
    Storage(#[from] anyhow::Error),

    /// 无法删除活跃 Session
    #[error("无法删除活跃 Session: {0}")]
    CannotDeleteActive(SessionId),

    /// 麦克风获取失败
    #[error("麦克风获取失败")]
    MicrophoneAcquireFailed,

    /// 其他错误
    #[error("{0}")]
    Other(String),
}

pub type SessionResult<T> = Result<T, SessionError>;

// ============================================================================
// Session 运行时实例
// ============================================================================

/// 活跃 Session 实例
///
/// 包含 Session 的运行时状态和资源
#[derive(Debug)]
pub struct ActiveSession {
    /// Session ID
    pub id: SessionId,
    /// 模式 ID
    pub mode_id: String,
    /// 当前状态
    pub state: SessionState,
    /// 元数据
    pub meta: SessionMeta,
    /// 存储句柄
    pub storage: SessionStorage,
    /// 配置
    pub config: SessionConfig,
    /// 录制开始时间
    pub recording_started_at: Option<Instant>,
    /// 累计录制时长（毫秒）
    pub accumulated_duration_ms: u64,
    /// 是否拥有麦克风
    pub has_microphone: bool,
}

impl ActiveSession {
    /// 创建新的活跃 Session
    pub fn new(
        id: SessionId,
        config: SessionConfig,
        meta: SessionMeta,
        storage: SessionStorage,
    ) -> Self {
        Self {
            id,
            mode_id: config.mode_id.clone(),
            state: SessionState::Created,
            meta,
            storage,
            config,
            recording_started_at: None,
            accumulated_duration_ms: 0,
            has_microphone: false,
        }
    }

    /// 获取当前录制时长（毫秒）
    #[must_use]
    pub fn current_duration_ms(&self) -> u64 {
        let running_duration = self
            .recording_started_at
            .map(|start| start.elapsed().as_millis() as u64)
            .unwrap_or(0);
        self.accumulated_duration_ms + running_duration
    }

    /// 转换为 SessionInfo
    #[must_use]
    pub fn to_info(&self) -> SessionInfo {
        SessionInfo {
            id: self.id.clone(),
            mode_id: self.mode_id.clone(),
            status: self.state.as_str().to_string(),
            name: self.meta.name.clone(),
            created_at: self.meta.created_at.clone(),
            updated_at: self.meta.updated_at.clone(),
            duration_ms: self.current_duration_ms(),
            word_count: self.meta.stats.word_count,
            is_recording: self.state.is_recording(),
            is_paused: self.state.is_paused(),
            has_microphone: self.has_microphone,
        }
    }

    /// 更新元数据
    pub fn update_meta(&mut self) {
        self.meta.updated_at = Utc::now().to_rfc3339();
        self.meta.stats.duration_ms = self.current_duration_ms();
        self.meta.status = (&self.state).into();
    }
}

// ============================================================================
// Session 管理器
// ============================================================================

/// Session 管理器
///
/// 负责管理所有 Session 的生命周期，包括创建、启动、暂停、停止等操作
#[derive(Debug)]
pub struct SessionManager {
    /// 活跃 Session 列表
    active_sessions: RwLock<HashMap<SessionId, ActiveSession>>,
    /// 存储引擎
    storage: Arc<StorageEngine>,
    /// 事件总线
    event_bus: SharedEventBus,
    /// 麦克风管理器
    mic_manager: SharedMicrophoneManager,
}

impl SessionManager {
    /// 创建新的 Session 管理器
    #[must_use]
    pub fn new(
        storage: Arc<StorageEngine>,
        event_bus: SharedEventBus,
        mic_manager: SharedMicrophoneManager,
    ) -> Self {
        Self {
            active_sessions: RwLock::new(HashMap::new()),
            storage,
            event_bus,
            mic_manager,
        }
    }

    // ========================================================================
    // Session 创建
    // ========================================================================

    /// 创建新的 Session
    ///
    /// # 参数
    ///
    /// - `config`: Session 配置
    ///
    /// # 返回
    ///
    /// 返回新创建的 Session ID
    pub fn create(&self, config: SessionConfig) -> SessionResult<SessionId> {
        let id = Uuid::new_v4().to_string();

        // 创建元数据
        let mut meta = SessionMeta::new(config.mode_id.clone(), config.to_audio_config());
        meta.name = config.name.clone();

        // 创建存储
        let storage = self
            .storage
            .create_session(&meta)
            .map_err(SessionError::Storage)?;

        // 创建活跃 Session
        let session = ActiveSession::new(id.clone(), config, meta.clone(), storage);

        // 存入活跃列表
        {
            let mut sessions = self.active_sessions.write().expect("获取锁失败");
            sessions.insert(id.clone(), session);
        }

        // 发送事件
        self.event_bus.publish(AppEvent::SessionCreated(SessionCreatedPayload {
            session_id: id.clone(),
            mode_id: meta.mode_id,
            created_at: meta.created_at,
        }));

        info!(session_id = %id, "Session 已创建");
        Ok(id)
    }

    // ========================================================================
    // Session 控制
    // ========================================================================

    /// 开始录制
    ///
    /// 将 Session 从 Created 状态转换为 Recording 状态
    pub fn start(&self, session_id: &SessionId) -> SessionResult<()> {
        let mut sessions = self.active_sessions.write().expect("获取锁失败");
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| SessionError::NotFound(session_id.clone()))?;

        // 验证状态转换
        if !session.state.can_transition_to(&SessionState::Recording) {
            return Err(SessionError::InvalidStateTransition(
                SessionStateError::InvalidTransition {
                    from: session.state.clone(),
                    to: SessionState::Recording,
                },
            ));
        }

        // 获取麦克风（如果需要）
        if session.config.use_microphone {
            let result = self
                .mic_manager
                .acquire(session_id.clone(), session.config.microphone_priority);
            match result {
                AcquireResult::Acquired | AcquireResult::Preempted { .. } => {
                    session.has_microphone = true;
                }
                AcquireResult::Queued { position } => {
                    debug!(
                        session_id = %session_id,
                        position,
                        "麦克风排队中"
                    );
                    session.has_microphone = false;
                }
            }
        }

        // 更新状态
        session.state = SessionState::Recording;
        session.recording_started_at = Some(Instant::now());
        session.update_meta();

        // 保存元数据
        if let Err(e) = session.storage.save_meta(&session.meta) {
            warn!(error = %e, "保存 Session 元数据失败");
        }

        // 发送事件
        self.event_bus.publish(AppEvent::SessionStarted(SessionIdPayload::new(session_id)));

        info!(session_id = %session_id, "Session 已开始录制");
        Ok(())
    }

    /// 暂停录制
    pub fn pause(&self, session_id: &SessionId) -> SessionResult<()> {
        let mut sessions = self.active_sessions.write().expect("获取锁失败");
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| SessionError::NotFound(session_id.clone()))?;

        // 验证状态转换
        if !session.state.can_transition_to(&SessionState::Paused) {
            return Err(SessionError::InvalidStateTransition(
                SessionStateError::InvalidTransition {
                    from: session.state.clone(),
                    to: SessionState::Paused,
                },
            ));
        }

        // 累计录制时长
        if let Some(start) = session.recording_started_at.take() {
            session.accumulated_duration_ms += start.elapsed().as_millis() as u64;
        }

        // 更新状态
        session.state = SessionState::Paused;
        session.update_meta();

        // 保存元数据
        if let Err(e) = session.storage.save_meta(&session.meta) {
            warn!(error = %e, "保存 Session 元数据失败");
        }

        // 发送事件
        self.event_bus.publish(AppEvent::SessionPaused(SessionIdPayload::new(session_id)));

        info!(session_id = %session_id, "Session 已暂停");
        Ok(())
    }

    /// 恢复录制
    pub fn resume(&self, session_id: &SessionId) -> SessionResult<()> {
        let mut sessions = self.active_sessions.write().expect("获取锁失败");
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| SessionError::NotFound(session_id.clone()))?;

        // 验证状态转换
        if !session.state.can_transition_to(&SessionState::Recording) {
            return Err(SessionError::InvalidStateTransition(
                SessionStateError::InvalidTransition {
                    from: session.state.clone(),
                    to: SessionState::Recording,
                },
            ));
        }

        // 更新状态
        session.state = SessionState::Recording;
        session.recording_started_at = Some(Instant::now());
        session.update_meta();

        // 保存元数据
        if let Err(e) = session.storage.save_meta(&session.meta) {
            warn!(error = %e, "保存 Session 元数据失败");
        }

        // 发送事件
        self.event_bus.publish(AppEvent::SessionResumed(SessionIdPayload::new(session_id)));

        info!(session_id = %session_id, "Session 已恢复录制");
        Ok(())
    }

    /// 停止录制并完成 Session
    pub fn stop(&self, session_id: &SessionId) -> SessionResult<()> {
        let mut sessions = self.active_sessions.write().expect("获取锁失败");
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| SessionError::NotFound(session_id.clone()))?;

        // 验证状态转换
        if !session.state.can_transition_to(&SessionState::Completed) {
            return Err(SessionError::InvalidStateTransition(
                SessionStateError::InvalidTransition {
                    from: session.state.clone(),
                    to: SessionState::Completed,
                },
            ));
        }

        // 累计录制时长
        if let Some(start) = session.recording_started_at.take() {
            session.accumulated_duration_ms += start.elapsed().as_millis() as u64;
        }

        // 释放麦克风
        if session.has_microphone {
            self.mic_manager.release(session_id);
            session.has_microphone = false;
        }

        // 更新状态
        session.state = SessionState::Completed;
        session.meta.completed_at = Some(Utc::now().to_rfc3339());
        session.update_meta();

        // 保存元数据
        if let Err(e) = session.storage.save_meta(&session.meta) {
            warn!(error = %e, "保存 Session 元数据失败");
        }

        // 发送事件
        self.event_bus.publish(AppEvent::SessionEnded(SessionIdPayload::new(session_id)));

        info!(
            session_id = %session_id,
            duration_ms = session.accumulated_duration_ms,
            "Session 已完成"
        );
        Ok(())
    }

    /// 标记 Session 为错误状态
    /// 设置 Session 使用的 ASR Provider 信息
    pub fn set_asr_info(
        &self,
        session_id: &SessionId,
        provider: AsrProviderType,
        model: Option<String>,
    ) -> SessionResult<()> {
        let mut sessions = self.active_sessions.write().expect("获取锁失败");
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| SessionError::NotFound(session_id.clone()))?;

        session.meta.set_asr_info(provider, model);

        // 保存元数据
        if let Err(e) = session.storage.save_meta(&session.meta) {
            warn!(error = %e, "保存 Session 元数据（ASR 信息）失败");
        }

        Ok(())
    }

    pub fn set_error(&self, session_id: &SessionId, error: &str) -> SessionResult<()> {
        let mut sessions = self.active_sessions.write().expect("获取锁失败");
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| SessionError::NotFound(session_id.clone()))?;

        // 累计录制时长
        if let Some(start) = session.recording_started_at.take() {
            session.accumulated_duration_ms += start.elapsed().as_millis() as u64;
        }

        // 释放麦克风
        if session.has_microphone {
            self.mic_manager.release(session_id);
            session.has_microphone = false;
        }

        // 更新状态
        session.state = SessionState::Error {
            message: error.to_string(),
        };
        session.meta.error = Some(error.to_string());
        session.update_meta();

        // 保存元数据
        if let Err(e) = session.storage.save_meta(&session.meta) {
            warn!(error = %e, "保存 Session 元数据失败");
        }

        // 发送事件
        self.event_bus.publish(AppEvent::SessionError(SessionErrorPayload {
            session_id: session_id.clone(),
            error: error.to_string(),
        }));

        error!(session_id = %session_id, error = %error, "Session 发生错误");
        Ok(())
    }

    // ========================================================================
    // 转录管理
    // ========================================================================

    /// 添加转录段落
    pub fn add_transcript(&self, session_id: &SessionId, segment: TranscriptSegment) -> SessionResult<()> {
        let mut sessions = self.active_sessions.write().expect("获取锁失败");
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| SessionError::NotFound(session_id.clone()))?;

        // 保存到文件
        session
            .storage
            .append_transcript(&segment)
            .map_err(SessionError::Storage)?;

        // 更新统计
        let char_count = segment.text.chars().count() as u32;
        session.meta.stats.segment_count += 1;
        session.meta.stats.character_count += char_count;
        // 简单估算字数（中文按字符计算）
        session.meta.stats.word_count += char_count;

        debug!(
            session_id = %session_id,
            text_len = segment.text.len(),
            "添加转录段落"
        );

        Ok(())
    }

    /// 更新 Session 统计
    pub fn update_stats(&self, session_id: &SessionId, update: SessionStatsUpdate) -> SessionResult<()> {
        let mut sessions = self.active_sessions.write().expect("获取锁失败");
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| SessionError::NotFound(session_id.clone()))?;

        session.meta.stats.word_count += update.word_count_delta;
        session.meta.stats.character_count += update.character_count_delta;
        session.meta.stats.segment_count += update.segment_count_delta;

        Ok(())
    }

    // ========================================================================
    // 查询方法
    // ========================================================================

    /// 获取 Session 信息
    pub fn get(&self, session_id: &SessionId) -> SessionResult<SessionInfo> {
        let sessions = self.active_sessions.read().expect("获取锁失败");
        let session = sessions
            .get(session_id)
            .ok_or_else(|| SessionError::NotFound(session_id.clone()))?;
        Ok(session.to_info())
    }

    /// 获取 Session 配置
    pub fn get_config(&self, session_id: &SessionId) -> SessionResult<SessionConfig> {
        let sessions = self.active_sessions.read().expect("获取锁失败");
        let session = sessions
            .get(session_id)
            .ok_or_else(|| SessionError::NotFound(session_id.clone()))?;
        Ok(session.config.clone())
    }

    /// 获取 Session 元数据
    pub fn get_meta(&self, session_id: &SessionId) -> SessionResult<SessionMeta> {
        let sessions = self.active_sessions.read().expect("获取锁失败");
        let session = sessions
            .get(session_id)
            .ok_or_else(|| SessionError::NotFound(session_id.clone()))?;
        Ok(session.meta.clone())
    }

    /// 检查 Session 是否存在
    #[must_use]
    pub fn exists(&self, session_id: &SessionId) -> bool {
        self.active_sessions
            .read()
            .expect("获取锁失败")
            .contains_key(session_id)
    }

    /// 获取所有活跃 Session 列表
    #[must_use]
    pub fn list_active(&self) -> Vec<SessionInfo> {
        self.active_sessions
            .read()
            .expect("获取锁失败")
            .values()
            .map(|s| s.to_info())
            .collect()
    }

    /// 获取活跃 Session 数量
    #[must_use]
    pub fn active_count(&self) -> usize {
        self.active_sessions.read().expect("获取锁失败").len()
    }

    /// 获取正在录制的 Session 数量
    #[must_use]
    pub fn recording_count(&self) -> usize {
        self.active_sessions
            .read()
            .expect("获取锁失败")
            .values()
            .filter(|s| s.state.is_recording())
            .count()
    }

    // ========================================================================
    // Session 清理
    // ========================================================================

    /// 从活跃列表中移除已完成的 Session
    pub fn remove_completed(&self, session_id: &SessionId) -> SessionResult<()> {
        let mut sessions = self.active_sessions.write().expect("获取锁失败");
        
        // 检查状态
        if let Some(session) = sessions.get(session_id) {
            if !session.state.is_terminal() {
                return Err(SessionError::CannotDeleteActive(session_id.clone()));
            }
        }

        sessions.remove(session_id);
        debug!(session_id = %session_id, "Session 已从活跃列表移除");
        Ok(())
    }

    /// 清理所有已完成的 Session
    pub fn cleanup_completed(&self) -> usize {
        let mut sessions = self.active_sessions.write().expect("获取锁失败");
        let before_count = sessions.len();
        sessions.retain(|_, s| !s.state.is_terminal());
        let removed = before_count - sessions.len();
        if removed > 0 {
            info!(count = removed, "清理已完成的 Session");
        }
        removed
    }

    /// 强制停止所有活跃 Session
    pub fn stop_all(&self) {
        let session_ids: Vec<_> = {
            self.active_sessions
                .read()
                .expect("获取锁失败")
                .keys()
                .cloned()
                .collect()
        };

        for session_id in session_ids {
            if let Err(e) = self.stop(&session_id) {
                warn!(session_id = %session_id, error = %e, "停止 Session 失败");
            }
        }
    }
}

/// 共享 Session 管理器类型
pub type SharedSessionManager = Arc<SessionManager>;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::create_shared_microphone_manager;
    use crate::event::create_shared_event_bus;

    fn create_test_manager() -> SessionManager {
        let storage = Arc::new(StorageEngine::new().unwrap());
        let event_bus = create_shared_event_bus();
        let mic_manager = create_shared_microphone_manager();
        SessionManager::new(storage, event_bus, mic_manager)
    }

    #[test]
    fn test_create_session() {
        let manager = create_test_manager();
        let config = SessionConfig::default();

        let result = manager.create(config);
        assert!(result.is_ok());

        let session_id = result.unwrap();
        assert!(manager.exists(&session_id));
        assert_eq!(manager.active_count(), 1);
    }

    #[test]
    fn test_session_lifecycle() {
        let manager = create_test_manager();
        let config = SessionConfig::default();

        let session_id = manager.create(config).unwrap();

        // Start
        assert!(manager.start(&session_id).is_ok());
        let info = manager.get(&session_id).unwrap();
        assert!(info.is_recording);

        // Pause
        assert!(manager.pause(&session_id).is_ok());
        let info = manager.get(&session_id).unwrap();
        assert!(info.is_paused);

        // Resume
        assert!(manager.resume(&session_id).is_ok());
        let info = manager.get(&session_id).unwrap();
        assert!(info.is_recording);

        // Stop
        assert!(manager.stop(&session_id).is_ok());
        let info = manager.get(&session_id).unwrap();
        assert_eq!(info.status, "completed");
    }

    #[test]
    fn test_invalid_transition() {
        let manager = create_test_manager();
        let config = SessionConfig::default();

        let session_id = manager.create(config).unwrap();

        // Try to pause without starting (invalid)
        let result = manager.pause(&session_id);
        assert!(result.is_err());
    }

    #[test]
    fn test_multiple_sessions() {
        let manager = create_test_manager();

        let id1 = manager.create(SessionConfig::default()).unwrap();
        let id2 = manager.create(SessionConfig::default()).unwrap();

        assert_eq!(manager.active_count(), 2);

        manager.start(&id1).unwrap();
        manager.start(&id2).unwrap();

        assert_eq!(manager.recording_count(), 2);

        manager.stop(&id1).unwrap();
        assert_eq!(manager.recording_count(), 1);
    }
}
