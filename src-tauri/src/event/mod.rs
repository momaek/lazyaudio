//! 事件总线模块
//!
//! 管理后端到前端的事件发送和内部事件通信
//!
//! # 架构
//!
//! ```text
//! ┌─────────────────────────────────────────────────────────────┐
//! │                         Rust 后端                           │
//! │                                                             │
//! │   ┌─────────┐    publish    ┌───────────┐   emit   ┌──────┐│
//! │   │ Session │ ───────────→ │ EventBus  │ ───────→ │Tauri ││
//! │   │   ASR   │               │           │          │Bridge││
//! │   │  Audio  │               └───────────┘          └──┬───┘│
//! │   └─────────┘                    │                    │    │
//! │                                  │ subscribe          │    │
//! │                                  ▼                    │    │
//! │                          ┌───────────┐                │    │
//! │                          │ Internal  │                │    │
//! │                          │Subscribers│                │    │
//! │                          └───────────┘                │    │
//! └───────────────────────────────────────────────────────┼────┘
//!                                                         │
//!                                               tauri emit│
//!                                                         ▼
//! ┌─────────────────────────────────────────────────────────────┐
//! │                         Vue 前端                            │
//! │   ┌───────────┐   listen   ┌───────────┐   update  ┌──────┐│
//! │   │ useEvents │ ◀───────── │   Tauri   │ ────────→ │ Vue  ││
//! │   │composable │            │  listen() │           │State ││
//! │   └───────────┘            └───────────┘           └──────┘│
//! └─────────────────────────────────────────────────────────────┘
//! ```

mod bus;
mod tauri_bridge;
mod types;

pub use bus::{create_shared_event_bus, EventBus, SharedEventBus, SubscriberId};
pub use tauri_bridge::{EventEmitter, SharedEventEmitter, TauriBridge};
pub use types::*;
