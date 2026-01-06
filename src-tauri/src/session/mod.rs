//! Session 管理模块
//!
//! 管理录制会话的生命周期和状态
//!
//! # 架构
//!
//! ```text
//! ┌─────────────────────────────────────────────────────────────┐
//! │                      SessionManager                          │
//! │                                                              │
//! │  ┌──────────────────────────────────────────────────────┐  │
//! │  │              Active Sessions                          │  │
//! │  │                                                       │  │
//! │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │  │
//! │  │  │  Session 1  │  │  Session 2  │  │  Session N  │   │  │
//! │  │  │  Recording  │  │   Paused    │  │  Created    │   │  │
//! │  │  └─────────────┘  └─────────────┘  └─────────────┘   │  │
//! │  └──────────────────────────────────────────────────────┘  │
//! │                                                              │
//! │  Dependencies:                                               │
//! │  ├── StorageEngine    → 持久化存储                          │
//! │  ├── EventBus         → 事件通知                            │
//! │  └── MicrophoneManager → 麦克风资源管理                     │
//! └─────────────────────────────────────────────────────────────┘
//! ```
//!
//! # 状态机
//!
//! ```text
//! Created → Recording ⇄ Paused → Completed
//!                   ↘ Error
//! ```

mod manager;
pub mod runtime;
mod state;
mod types;

pub use manager::{
    ActiveSession, SessionError, SessionManager, SessionResult, SharedSessionManager,
};
pub use runtime::{
    create_shared_runtime_manager, SessionRuntimeManager, SharedSessionRuntimeManager,
};
pub use state::{SessionState, SessionStateError};
pub use types::{AudioSourceConfig, SessionConfig, SessionId, SessionInfo, SessionStatsUpdate};
