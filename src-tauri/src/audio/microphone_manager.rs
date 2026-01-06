//! 麦克风管理器模块
//!
//! 管理麦克风资源的独占访问和优先级抢占机制

use std::collections::BinaryHeap;
use std::sync::{Arc, RwLock};
use std::time::Instant;

use tracing::{debug, info};

use crate::event::{
    AppEvent, MicrophonePreemptedPayload, SessionIdPayload, SharedEventBus,
};

// ============================================================================
// 优先级常量
// ============================================================================

/// 输入法模式优先级（最高）
pub const PRIORITY_INPUT_METHOD: u8 = 100;

/// 主模式优先级（会议、面试）
pub const PRIORITY_PRIMARY: u8 = 50;

/// 后台模式优先级
pub const PRIORITY_BACKGROUND: u8 = 10;

// ============================================================================
// 类型定义
// ============================================================================

/// Session ID 类型
pub type SessionId = String;

/// 麦克风获取结果
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AcquireResult {
    /// 成功获取麦克风
    Acquired,
    /// 进入等待队列
    Queued {
        /// 队列中的位置（从 0 开始）
        position: usize,
    },
    /// 抢占成功
    Preempted {
        /// 被抢占的 Session ID
        previous: SessionId,
    },
}

/// 队列条目
#[derive(Debug, Clone)]
struct QueueEntry {
    /// Session ID
    session_id: SessionId,
    /// 优先级
    priority: u8,
    /// 请求时间
    requested_at: Instant,
}

impl PartialEq for QueueEntry {
    fn eq(&self, other: &Self) -> bool {
        self.session_id == other.session_id
    }
}

impl Eq for QueueEntry {}

impl PartialOrd for QueueEntry {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for QueueEntry {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        // 优先级高的排前面
        // 优先级相同时，请求时间早的排前面
        match self.priority.cmp(&other.priority) {
            std::cmp::Ordering::Equal => other.requested_at.cmp(&self.requested_at),
            ord => ord,
        }
    }
}

/// 当前所有者信息
#[derive(Debug, Clone)]
struct OwnerInfo {
    /// Session ID
    session_id: SessionId,
    /// 优先级
    priority: u8,
    /// 获取时间
    acquired_at: Instant,
}

// ============================================================================
// 麦克风管理器
// ============================================================================

/// 麦克风管理器
///
/// 管理麦克风资源的独占访问，支持基于优先级的抢占机制
///
/// # 优先级规则
///
/// - 输入法模式 (100): 最高优先级，可抢占任何其他模式
/// - 主模式 (50): 标准会议/面试模式
/// - 后台模式 (10): 最低优先级
///
/// # 抢占规则
///
/// - 高优先级可抢占低优先级
/// - 相同优先级不能抢占，进入等待队列
/// - 被抢占的 Session 会收到 `MicrophonePreempted` 事件
#[derive(Debug)]
pub struct MicrophoneManager {
    /// 当前所有者
    current_owner: RwLock<Option<OwnerInfo>>,
    /// 等待队列
    waiting_queue: RwLock<BinaryHeap<QueueEntry>>,
    /// 事件总线
    event_bus: Option<SharedEventBus>,
}

impl MicrophoneManager {
    /// 创建新的麦克风管理器
    #[must_use]
    pub fn new() -> Self {
        Self {
            current_owner: RwLock::new(None),
            waiting_queue: RwLock::new(BinaryHeap::new()),
            event_bus: None,
        }
    }

    /// 创建带事件总线的麦克风管理器
    #[must_use]
    pub fn with_event_bus(event_bus: SharedEventBus) -> Self {
        Self {
            current_owner: RwLock::new(None),
            waiting_queue: RwLock::new(BinaryHeap::new()),
            event_bus: Some(event_bus),
        }
    }

    /// 设置事件总线
    pub fn set_event_bus(&mut self, event_bus: SharedEventBus) {
        self.event_bus = Some(event_bus);
    }

    /// 尝试获取麦克风
    ///
    /// # 参数
    ///
    /// - `session_id`: 请求者的 Session ID
    /// - `priority`: 请求优先级
    ///
    /// # 返回
    ///
    /// - `Acquired`: 成功获取
    /// - `Queued { position }`: 进入等待队列
    /// - `Preempted { previous }`: 抢占成功
    pub fn acquire(&self, session_id: SessionId, priority: u8) -> AcquireResult {
        let mut owner = self.current_owner.write().expect("获取 owner 锁失败");

        match owner.as_ref() {
            None => {
                // 没有当前所有者，直接获取
                *owner = Some(OwnerInfo {
                    session_id: session_id.clone(),
                    priority,
                    acquired_at: Instant::now(),
                });
                
                info!(session_id = %session_id, priority, "麦克风已获取");
                self.emit_acquired(&session_id);
                
                AcquireResult::Acquired
            }
            Some(current) if current.session_id == session_id => {
                // 已经是所有者
                debug!(session_id = %session_id, "已是麦克风所有者");
                AcquireResult::Acquired
            }
            Some(current) if priority > current.priority => {
                // 优先级更高，抢占
                let previous = current.session_id.clone();
                let previous_priority = current.priority;
                
                *owner = Some(OwnerInfo {
                    session_id: session_id.clone(),
                    priority,
                    acquired_at: Instant::now(),
                });
                
                // 将被抢占者加入队列头部
                {
                    let mut queue = self.waiting_queue.write().expect("获取 queue 锁失败");
                    queue.push(QueueEntry {
                        session_id: previous.clone(),
                        priority: previous_priority,
                        requested_at: Instant::now(),
                    });
                }
                
                info!(
                    session_id = %session_id,
                    priority,
                    previous = %previous,
                    "麦克风抢占成功"
                );
                
                self.emit_preempted(&previous, &session_id);
                self.emit_acquired(&session_id);
                
                AcquireResult::Preempted { previous }
            }
            Some(current) => {
                // 优先级不够高，加入等待队列
                let mut queue = self.waiting_queue.write().expect("获取 queue 锁失败");
                
                // 检查是否已在队列中
                let exists = queue.iter().any(|e| e.session_id == session_id);
                if exists {
                    // 计算位置：在当前条目之前有多少更高优先级的条目
                    let position = queue
                        .iter()
                        .filter(|e| e.session_id != session_id && e.priority > priority)
                        .count();
                    debug!(session_id = %session_id, position, "已在等待队列中");
                    return AcquireResult::Queued { position };
                }
                
                // 先计算位置再入队（因为新条目优先级可能最低）
                let position = queue
                    .iter()
                    .filter(|e| e.priority > priority)
                    .count();
                
                queue.push(QueueEntry {
                    session_id: session_id.clone(),
                    priority,
                    requested_at: Instant::now(),
                });
                
                debug!(
                    session_id = %session_id,
                    priority,
                    position,
                    current_owner = %current.session_id,
                    "已加入等待队列"
                );
                
                AcquireResult::Queued { position }
            }
        }
    }

    /// 释放麦克风
    ///
    /// 释放后会自动将麦克风分配给队列中优先级最高的等待者
    pub fn release(&self, session_id: &SessionId) {
        let mut owner = self.current_owner.write().expect("获取 owner 锁失败");

        // 检查是否是当前所有者
        let is_owner = owner.as_ref().map_or(false, |o| o.session_id == *session_id);
        
        if is_owner {
            // 发送释放事件
            self.emit_released(session_id);
            
            // 尝试从队列中获取下一个
            let mut queue = self.waiting_queue.write().expect("获取 queue 锁失败");
            
            if let Some(next) = queue.pop() {
                *owner = Some(OwnerInfo {
                    session_id: next.session_id.clone(),
                    priority: next.priority,
                    acquired_at: Instant::now(),
                });
                
                info!(
                    released = %session_id,
                    next = %next.session_id,
                    "麦克风已转移"
                );
                
                self.emit_acquired(&next.session_id);
            } else {
                *owner = None;
                info!(session_id = %session_id, "麦克风已释放");
            }
        } else {
            // 不是所有者，可能在队列中
            let mut queue = self.waiting_queue.write().expect("获取 queue 锁失败");
            let old_len = queue.len();
            
            // 移除队列中的条目
            let entries: Vec<_> = queue.drain().filter(|e| e.session_id != *session_id).collect();
            
            if entries.len() < old_len {
                debug!(session_id = %session_id, "已从等待队列中移除");
            }
            
            // 重建队列
            for entry in entries {
                queue.push(entry);
            }
        }
    }

    /// 获取当前所有者
    #[must_use]
    pub fn current_owner(&self) -> Option<SessionId> {
        self.current_owner
            .read()
            .expect("获取 owner 锁失败")
            .as_ref()
            .map(|o| o.session_id.clone())
    }

    /// 获取当前所有者的优先级
    #[must_use]
    pub fn current_owner_priority(&self) -> Option<u8> {
        self.current_owner
            .read()
            .expect("获取 owner 锁失败")
            .as_ref()
            .map(|o| o.priority)
    }

    /// 检查指定 Session 是否是当前所有者
    #[must_use]
    pub fn is_owner(&self, session_id: &SessionId) -> bool {
        self.current_owner
            .read()
            .expect("获取 owner 锁失败")
            .as_ref()
            .map_or(false, |o| o.session_id == *session_id)
    }

    /// 获取等待队列长度
    #[must_use]
    pub fn queue_length(&self) -> usize {
        self.waiting_queue
            .read()
            .expect("获取 queue 锁失败")
            .len()
    }

    /// 获取指定 Session 在队列中的位置
    ///
    /// 返回 `None` 表示不在队列中
    #[must_use]
    pub fn queue_position(&self, session_id: &SessionId) -> Option<usize> {
        let queue = self.waiting_queue.read().expect("获取 queue 锁失败");
        
        // 将队列转换为有序列表
        let mut entries: Vec<_> = queue.iter().cloned().collect();
        entries.sort_by(|a, b| b.cmp(a)); // 降序排列
        
        entries.iter().position(|e| e.session_id == *session_id)
    }

    /// 强制释放所有资源（用于清理）
    pub fn force_release_all(&self) {
        let mut owner = self.current_owner.write().expect("获取 owner 锁失败");
        let mut queue = self.waiting_queue.write().expect("获取 queue 锁失败");
        
        if let Some(ref o) = *owner {
            self.emit_released(&o.session_id);
        }
        
        *owner = None;
        queue.clear();
        
        info!("麦克风管理器已清空");
    }

    // ========== 私有方法 ==========

    fn emit_acquired(&self, session_id: &str) {
        if let Some(ref bus) = self.event_bus {
            bus.publish(AppEvent::MicrophoneAcquired(SessionIdPayload::new(
                session_id,
            )));
        }
    }

    fn emit_released(&self, session_id: &str) {
        if let Some(ref bus) = self.event_bus {
            bus.publish(AppEvent::MicrophoneReleased(SessionIdPayload::new(
                session_id,
            )));
        }
    }

    fn emit_preempted(&self, preempted: &str, by: &str) {
        if let Some(ref bus) = self.event_bus {
            bus.publish(AppEvent::MicrophonePreempted(MicrophonePreemptedPayload {
                session_id: preempted.to_string(),
                preempted_by: by.to_string(),
            }));
        }
    }
}

impl Default for MicrophoneManager {
    fn default() -> Self {
        Self::new()
    }
}

/// 共享麦克风管理器类型
pub type SharedMicrophoneManager = Arc<MicrophoneManager>;

/// 创建共享的麦克风管理器
#[must_use]
pub fn create_shared_microphone_manager() -> SharedMicrophoneManager {
    Arc::new(MicrophoneManager::new())
}

/// 创建带事件总线的共享麦克风管理器
#[must_use]
pub fn create_shared_microphone_manager_with_bus(event_bus: SharedEventBus) -> SharedMicrophoneManager {
    Arc::new(MicrophoneManager::with_event_bus(event_bus))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_acquire_when_free() {
        let manager = MicrophoneManager::new();
        
        let result = manager.acquire("session-1".to_string(), PRIORITY_PRIMARY);
        assert_eq!(result, AcquireResult::Acquired);
        assert_eq!(manager.current_owner(), Some("session-1".to_string()));
    }

    #[test]
    fn test_acquire_same_session() {
        let manager = MicrophoneManager::new();
        
        manager.acquire("session-1".to_string(), PRIORITY_PRIMARY);
        let result = manager.acquire("session-1".to_string(), PRIORITY_PRIMARY);
        
        assert_eq!(result, AcquireResult::Acquired);
    }

    #[test]
    fn test_preemption() {
        let manager = MicrophoneManager::new();
        
        // 低优先级获取
        manager.acquire("session-1".to_string(), PRIORITY_BACKGROUND);
        
        // 高优先级抢占
        let result = manager.acquire("session-2".to_string(), PRIORITY_INPUT_METHOD);
        
        assert_eq!(
            result,
            AcquireResult::Preempted {
                previous: "session-1".to_string()
            }
        );
        assert_eq!(manager.current_owner(), Some("session-2".to_string()));
        
        // 被抢占者应该在队列中
        assert_eq!(manager.queue_length(), 1);
    }

    #[test]
    fn test_queue_when_same_priority() {
        let manager = MicrophoneManager::new();
        
        manager.acquire("session-1".to_string(), PRIORITY_PRIMARY);
        let result = manager.acquire("session-2".to_string(), PRIORITY_PRIMARY);
        
        match result {
            AcquireResult::Queued { position } => {
                assert_eq!(position, 0);
            }
            _ => panic!("应该进入队列"),
        }
    }

    #[test]
    fn test_release_transfers_to_next() {
        let manager = MicrophoneManager::new();
        
        manager.acquire("session-1".to_string(), PRIORITY_PRIMARY);
        manager.acquire("session-2".to_string(), PRIORITY_PRIMARY); // 进入队列
        
        manager.release(&"session-1".to_string());
        
        assert_eq!(manager.current_owner(), Some("session-2".to_string()));
        assert_eq!(manager.queue_length(), 0);
    }

    #[test]
    fn test_release_from_queue() {
        let manager = MicrophoneManager::new();
        
        manager.acquire("session-1".to_string(), PRIORITY_PRIMARY);
        manager.acquire("session-2".to_string(), PRIORITY_PRIMARY);
        manager.acquire("session-3".to_string(), PRIORITY_PRIMARY);
        
        assert_eq!(manager.queue_length(), 2);
        
        // 从队列中移除 session-2
        manager.release(&"session-2".to_string());
        
        assert_eq!(manager.queue_length(), 1);
        assert_eq!(manager.current_owner(), Some("session-1".to_string()));
    }

    #[test]
    fn test_priority_queue_order() {
        let manager = MicrophoneManager::new();
        
        // 高优先级先获取
        manager.acquire("high".to_string(), PRIORITY_INPUT_METHOD);
        
        // 然后两个较低优先级进入队列
        manager.acquire("low".to_string(), PRIORITY_BACKGROUND);
        manager.acquire("mid".to_string(), PRIORITY_PRIMARY);
        
        // 释放高优先级
        manager.release(&"high".to_string());
        
        // mid 应该先获取（优先级更高）
        assert_eq!(manager.current_owner(), Some("mid".to_string()));
        
        manager.release(&"mid".to_string());
        assert_eq!(manager.current_owner(), Some("low".to_string()));
    }

    #[test]
    fn test_force_release_all() {
        let manager = MicrophoneManager::new();
        
        manager.acquire("session-1".to_string(), PRIORITY_PRIMARY);
        manager.acquire("session-2".to_string(), PRIORITY_PRIMARY);
        
        manager.force_release_all();
        
        assert!(manager.current_owner().is_none());
        assert_eq!(manager.queue_length(), 0);
    }

    #[test]
    fn test_is_owner() {
        let manager = MicrophoneManager::new();
        
        manager.acquire("session-1".to_string(), PRIORITY_PRIMARY);
        
        assert!(manager.is_owner(&"session-1".to_string()));
        assert!(!manager.is_owner(&"session-2".to_string()));
    }
}

