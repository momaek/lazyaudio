//! 事件总线模块
//!
//! 提供内部事件发布订阅机制

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, RwLock};

use tokio::sync::broadcast::{self, Receiver, Sender};
use tracing::{debug, trace};

use super::types::AppEvent;

/// 订阅者 ID 类型
pub type SubscriberId = u64;

/// 事件过滤器类型
pub type EventFilter = Box<dyn Fn(&AppEvent) -> bool + Send + Sync>;

/// 默认广播通道容量
const DEFAULT_CHANNEL_CAPACITY: usize = 256;

/// 事件总线
///
/// 提供应用内部的事件发布订阅机制
/// 
/// # 线程安全
/// 
/// `EventBus` 是线程安全的，可以在多线程环境中共享使用
/// 
/// # 示例
/// 
/// ```ignore
/// let bus = EventBus::new();
/// 
/// // 订阅所有事件
/// let mut rx = bus.subscribe();
/// 
/// // 发布事件
/// bus.publish(AppEvent::SessionStarted(SessionIdPayload::new("test")));
/// 
/// // 接收事件
/// if let Ok(event) = rx.try_recv() {
///     println!("Received: {:?}", event);
/// }
/// ```
#[derive(Debug)]
pub struct EventBus {
    /// 广播发送者
    sender: Sender<AppEvent>,
    /// 订阅者 ID 计数器
    next_subscriber_id: AtomicU64,
    /// 过滤器订阅者（订阅者 ID -> 过滤器）
    filtered_subscribers: RwLock<HashMap<SubscriberId, FilteredSubscriber>>,
}

/// 带过滤器的订阅者
struct FilteredSubscriber {
    /// 过滤器函数
    filter: EventFilter,
    /// 弱引用到外部追踪
    #[allow(dead_code)]
    active: bool,
}

impl std::fmt::Debug for FilteredSubscriber {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("FilteredSubscriber")
            .field("active", &self.active)
            .field("filter", &"<filter fn>")
            .finish()
    }
}

impl EventBus {
    /// 创建新的事件总线
    #[must_use]
    pub fn new() -> Self {
        Self::with_capacity(DEFAULT_CHANNEL_CAPACITY)
    }

    /// 创建指定容量的事件总线
    #[must_use]
    pub fn with_capacity(capacity: usize) -> Self {
        let (sender, _) = broadcast::channel(capacity);
        Self {
            sender,
            next_subscriber_id: AtomicU64::new(1),
            filtered_subscribers: RwLock::new(HashMap::new()),
        }
    }

    /// 发布事件
    ///
    /// 将事件发送给所有订阅者
    pub fn publish(&self, event: AppEvent) {
        trace!(event_name = event.event_name(), "发布事件");
        
        // 发送到广播通道
        match self.sender.send(event.clone()) {
            Ok(count) => {
                trace!("事件已发送给 {} 个订阅者", count);
            }
            Err(_) => {
                // 没有活跃的接收者，这是正常的
                trace!("没有活跃的订阅者");
            }
        }
    }

    /// 订阅所有事件
    ///
    /// 返回一个接收器，可以接收所有发布的事件
    #[must_use]
    pub fn subscribe(&self) -> Receiver<AppEvent> {
        let subscriber_id = self.next_subscriber_id.fetch_add(1, Ordering::SeqCst);
        debug!(subscriber_id, "新订阅者已注册");
        self.sender.subscribe()
    }

    /// 订阅特定类型的事件
    ///
    /// 使用过滤器函数筛选感兴趣的事件
    pub fn subscribe_filtered<F>(&self, filter: F) -> (SubscriberId, Receiver<AppEvent>)
    where
        F: Fn(&AppEvent) -> bool + Send + Sync + 'static,
    {
        let subscriber_id = self.next_subscriber_id.fetch_add(1, Ordering::SeqCst);
        let receiver = self.sender.subscribe();

        let filtered = FilteredSubscriber {
            filter: Box::new(filter),
            active: true,
        };

        if let Ok(mut subs) = self.filtered_subscribers.write() {
            subs.insert(subscriber_id, filtered);
        }

        debug!(subscriber_id, "过滤订阅者已注册");
        (subscriber_id, receiver)
    }

    /// 订阅特定 Session 的事件
    #[must_use]
    pub fn subscribe_session(&self, session_id: String) -> (SubscriberId, Receiver<AppEvent>) {
        self.subscribe_filtered(move |event| {
            event.session_id().map_or(false, |id| id == session_id)
        })
    }

    /// 订阅特定事件名的事件
    #[must_use]
    pub fn subscribe_event_name(&self, event_name: &'static str) -> (SubscriberId, Receiver<AppEvent>) {
        self.subscribe_filtered(move |event| event.event_name() == event_name)
    }

    /// 取消订阅
    pub fn unsubscribe(&self, subscriber_id: SubscriberId) {
        if let Ok(mut subs) = self.filtered_subscribers.write() {
            if subs.remove(&subscriber_id).is_some() {
                debug!(subscriber_id, "订阅者已取消");
            }
        }
    }

    /// 获取当前订阅者数量
    #[must_use]
    pub fn subscriber_count(&self) -> usize {
        self.sender.receiver_count()
    }

    /// 检查过滤器是否匹配事件
    pub fn matches_filter(&self, subscriber_id: SubscriberId, event: &AppEvent) -> bool {
        if let Ok(subs) = self.filtered_subscribers.read() {
            if let Some(sub) = subs.get(&subscriber_id) {
                return (sub.filter)(event);
            }
        }
        true // 没有过滤器时默认匹配
    }
}

impl Default for EventBus {
    fn default() -> Self {
        Self::new()
    }
}

impl Clone for EventBus {
    fn clone(&self) -> Self {
        Self {
            sender: self.sender.clone(),
            next_subscriber_id: AtomicU64::new(self.next_subscriber_id.load(Ordering::SeqCst)),
            filtered_subscribers: RwLock::new(HashMap::new()),
        }
    }
}

/// 共享事件总线类型
pub type SharedEventBus = Arc<EventBus>;

/// 创建共享的事件总线
#[must_use]
pub fn create_shared_event_bus() -> SharedEventBus {
    Arc::new(EventBus::new())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event::types::SessionIdPayload;

    #[tokio::test]
    async fn test_publish_subscribe() {
        let bus = EventBus::new();
        let mut rx = bus.subscribe();

        let event = AppEvent::SessionStarted(SessionIdPayload::new("test-123"));
        bus.publish(event.clone());

        let received = rx.recv().await.unwrap();
        assert_eq!(received.event_name(), "session:started");
    }

    #[tokio::test]
    async fn test_multiple_subscribers() {
        let bus = EventBus::new();
        let mut rx1 = bus.subscribe();
        let mut rx2 = bus.subscribe();

        assert_eq!(bus.subscriber_count(), 2);

        let event = AppEvent::SessionStarted(SessionIdPayload::new("test-123"));
        bus.publish(event);

        // 两个订阅者都应该收到事件
        let _ = rx1.recv().await.unwrap();
        let _ = rx2.recv().await.unwrap();
    }

    #[tokio::test]
    async fn test_session_subscription() {
        let bus = EventBus::new();
        let (sub_id, mut rx) = bus.subscribe_session("session-1".to_string());

        // 发布两个事件
        bus.publish(AppEvent::SessionStarted(SessionIdPayload::new("session-1")));
        bus.publish(AppEvent::SessionStarted(SessionIdPayload::new("session-2")));

        // 检查过滤器
        let event1 = AppEvent::SessionStarted(SessionIdPayload::new("session-1"));
        let event2 = AppEvent::SessionStarted(SessionIdPayload::new("session-2"));

        assert!(bus.matches_filter(sub_id, &event1));
        assert!(!bus.matches_filter(sub_id, &event2));

        bus.unsubscribe(sub_id);
    }

    #[test]
    fn test_event_bus_clone() {
        let bus = EventBus::new();
        let _cloned = bus.clone();
        
        // 克隆的总线共享相同的发送者
        assert_eq!(bus.subscriber_count(), 0);
    }
}

