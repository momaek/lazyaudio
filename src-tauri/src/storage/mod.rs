//! 存储引擎模块
//!
//! 管理配置、Session 数据和本地数据库

#![allow(clippy::missing_errors_doc)]

mod config;
mod database;
mod engine;
mod session_storage;

pub use config::*;
pub use database::*;
pub use engine::*;
pub use session_storage::*;

use std::path::PathBuf;

/// 当前 Schema 版本
pub const CURRENT_SCHEMA_VERSION: u32 = 1;

/// 获取应用数据目录
///
/// 返回 `~/.lazyaudio/` 或平台对应的数据目录
pub fn get_data_dir() -> anyhow::Result<PathBuf> {
    let base = dirs::data_local_dir().ok_or_else(|| anyhow::anyhow!("无法获取数据目录"))?;
    Ok(base.join("lazyaudio"))
}

/// 获取配置文件路径
pub fn get_config_path() -> anyhow::Result<PathBuf> {
    Ok(get_data_dir()?.join("config.json"))
}

/// 获取数据库目录
pub fn get_db_dir() -> anyhow::Result<PathBuf> {
    Ok(get_data_dir()?.join("db"))
}

/// 获取数据库文件路径
pub fn get_db_path() -> anyhow::Result<PathBuf> {
    Ok(get_db_dir()?.join("app.db"))
}

/// 获取模型目录
pub fn get_models_dir() -> anyhow::Result<PathBuf> {
    Ok(get_data_dir()?.join("models"))
}

/// 获取模式数据目录
pub fn get_modes_dir() -> anyhow::Result<PathBuf> {
    Ok(get_data_dir()?.join("modes"))
}

/// 获取 Session 存储目录
pub fn get_sessions_dir() -> anyhow::Result<PathBuf> {
    Ok(get_data_dir()?.join("sessions"))
}

/// 初始化数据目录结构
///
/// 创建以下目录：
/// - `~/.lazyaudio/`
/// - `~/.lazyaudio/db/`
/// - `~/.lazyaudio/models/`
/// - `~/.lazyaudio/modes/`
/// - `~/.lazyaudio/sessions/`
pub fn init_data_dirs() -> anyhow::Result<()> {
    let dirs = [
        get_data_dir()?,
        get_db_dir()?,
        get_models_dir()?,
        get_modes_dir()?,
        get_sessions_dir()?,
    ];

    for dir in dirs {
        if !dir.exists() {
            std::fs::create_dir_all(&dir)?;
            tracing::info!("创建目录: {}", dir.display());
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_data_dir() {
        let dir = get_data_dir().unwrap();
        assert!(dir.ends_with("lazyaudio"));
    }
}
