//! Tauri 事件桥接模块
//!
//! 将内部事件总线与 Tauri 前端事件系统连接

use std::sync::Arc;

use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast::error::RecvError;
use tracing::{error, info, trace, warn};

use super::bus::{EventBus, SharedEventBus};
use super::types::AppEvent;

/// Tauri 事件桥接器
///
/// 负责将 `EventBus` 中的事件转发到 Tauri 前端
pub struct TauriBridge {
    /// Tauri 应用句柄
    app_handle: AppHandle,
    /// 事件总线引用
    event_bus: SharedEventBus,
}

impl TauriBridge {
    /// 创建新的 Tauri 桥接器
    #[must_use]
    pub fn new(app_handle: AppHandle, event_bus: SharedEventBus) -> Self {
        Self {
            app_handle,
            event_bus,
        }
    }

    /// 推送单个事件到前端
    ///
    /// 使用事件的 `event_name()` 作为 Tauri 事件名
    pub fn emit(&self, event: &AppEvent) -> Result<(), String> {
        let event_name = event.event_name();
        
        trace!(event_name, "推送事件到前端");
        
        self.app_handle
            .emit(event_name, event)
            .map_err(|e| format!("发送事件失败: {e}"))?;
        
        Ok(())
    }

    /// 推送事件到特定窗口
    pub fn emit_to(&self, label: &str, event: &AppEvent) -> Result<(), String> {
        let event_name = event.event_name();
        
        trace!(event_name, window = label, "推送事件到窗口");
        
        self.app_handle
            .emit_to(label, event_name, event)
            .map_err(|e| format!("发送事件到窗口失败: {e}"))?;
        
        Ok(())
    }

    /// 启动事件转发任务
    ///
    /// 在后台任务中监听事件总线，并将事件转发到 Tauri 前端
    pub fn start_forwarding(self) {
        let app_handle = self.app_handle.clone();
        let event_bus = self.event_bus.clone();

        // 使用 tauri 的异步运行时来启动任务
        tauri::async_runtime::spawn(async move {
            let mut receiver = event_bus.subscribe();
            
            info!("事件转发任务已启动");

            loop {
                match receiver.recv().await {
                    Ok(event) => {
                        let event_name = event.event_name();
                        
                        if let Err(e) = app_handle.emit(event_name, &event) {
                            error!(event_name, error = %e, "转发事件失败");
                        } else {
                            trace!(event_name, "事件已转发到前端");
                        }
                    }
                    Err(RecvError::Lagged(count)) => {
                        warn!(count, "事件接收滞后，跳过了 {} 个事件", count);
                    }
                    Err(RecvError::Closed) => {
                        info!("事件通道已关闭，停止转发");
                        break;
                    }
                }
            }
        });
    }

    /// 获取事件总线引用
    #[must_use]
    pub fn event_bus(&self) -> &SharedEventBus {
        &self.event_bus
    }

    /// 获取 Tauri 应用句柄
    #[must_use]
    pub fn app_handle(&self) -> &AppHandle {
        &self.app_handle
    }
}

/// 事件发射器 trait
///
/// 抽象事件发送能力，方便测试
pub trait EventEmitter: Send + Sync {
    /// 发送事件
    fn emit(&self, event: &AppEvent) -> Result<(), String>;
}

/// Tauri 事件发射器实现
impl EventEmitter for TauriBridge {
    fn emit(&self, event: &AppEvent) -> Result<(), String> {
        self.emit(event)
    }
}

/// 直接使用 EventBus 的发射器（用于内部通信）
impl EventEmitter for EventBus {
    fn emit(&self, event: &AppEvent) -> Result<(), String> {
        self.publish(event.clone());
        Ok(())
    }
}

/// 共享事件发射器
pub type SharedEventEmitter = Arc<dyn EventEmitter>;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event::types::SessionIdPayload;

    // 注意：完整的 Tauri 桥接测试需要在集成测试中进行
    // 这里只测试 EventEmitter trait 的基本行为

    #[test]
    fn test_event_bus_as_emitter() {
        let bus = EventBus::default();
        let mut rx = bus.subscribe();

        let event = AppEvent::SessionStarted(SessionIdPayload::new("test"));
        bus.emit(&event).unwrap();

        // 验证事件被发布
        assert!(rx.try_recv().is_ok());
    }
}

