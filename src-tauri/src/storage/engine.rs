//! 存储引擎模块
//!
//! 整合配置、数据库和文件存储

#![allow(clippy::missing_errors_doc)]

use std::sync::Arc;
use tokio::sync::RwLock;

use super::{
    get_modes_dir, init_data_dirs, load_config, save_config, AppConfig, Database, SessionMeta,
    SessionRecord, SessionStorage, TranscriptSegment,
};

/// 存储引擎
///
/// 提供统一的存储访问接口
#[derive(Debug)]
pub struct StorageEngine {
    /// 应用配置
    config: Arc<RwLock<AppConfig>>,
    /// `SQLite` 数据库
    db: Database,
}

impl StorageEngine {
    /// 初始化存储引擎
    pub fn new() -> anyhow::Result<Self> {
        // 初始化目录结构
        init_data_dirs()?;

        // 加载配置
        let config = load_config()?;

        // 打开数据库
        let db = Database::open()?;

        tracing::info!("存储引擎初始化完成");

        Ok(Self {
            config: Arc::new(RwLock::new(config)),
            db,
        })
    }

    // ========================================================================
    // 配置相关方法
    // ========================================================================

    /// 获取配置副本
    pub async fn get_config(&self) -> AppConfig {
        self.config.read().await.clone()
    }

    /// 更新配置
    pub async fn set_config(&self, config: AppConfig) -> anyhow::Result<()> {
        // 保存到文件
        save_config(&config)?;

        // 更新内存中的配置
        let mut current = self.config.write().await;
        *current = config;

        Ok(())
    }

    /// 更新部分配置
    pub async fn update_config<F>(&self, updater: F) -> anyhow::Result<()>
    where
        F: FnOnce(&mut AppConfig),
    {
        let mut config = self.config.write().await;
        updater(&mut config);
        save_config(&config)?;
        Ok(())
    }

    // ========================================================================
    // Session 相关方法
    // ========================================================================

    /// 创建新的 Session
    pub fn create_session(&self, meta: &SessionMeta) -> anyhow::Result<SessionStorage> {
        // 创建文件存储
        let storage = SessionStorage::create(&meta.id, &meta.created_at)?;

        // 保存元数据
        storage.save_meta(meta)?;

        // 创建数据库记录
        #[allow(clippy::cast_possible_wrap)]
        let record = SessionRecord {
            id: meta.id.clone(),
            mode_id: meta.mode_id.clone(),
            name: meta.name.clone(),
            status: meta.status.to_string(),
            created_at: meta.created_at.clone(),
            updated_at: meta.updated_at.clone(),
            completed_at: meta.completed_at.clone(),
            duration_ms: meta.stats.duration_ms as i64,
            word_count: meta.stats.word_count as i32,
            character_count: meta.stats.character_count as i32,
            directory_path: storage.directory_path(),
            tags: if meta.tags.is_empty() {
                None
            } else {
                Some(serde_json::to_string(&meta.tags)?)
            },
        };
        self.db.insert_session(&record)?;

        Ok(storage)
    }

    /// 打开已存在的 Session
    pub fn open_session(&self, session_id: &str) -> anyhow::Result<SessionStorage> {
        let record = self
            .db
            .get_session(session_id)?
            .ok_or_else(|| anyhow::anyhow!("Session 不存在: {session_id}"))?;

        SessionStorage::open(&record.directory_path)
    }

    /// 更新 Session 元数据
    pub fn update_session_meta(&self, storage: &SessionStorage, meta: &SessionMeta) -> anyhow::Result<()> {
        // 保存到文件
        storage.save_meta(meta)?;

        // 更新数据库
        #[allow(clippy::cast_possible_wrap)]
        let record = SessionRecord {
            id: meta.id.clone(),
            mode_id: meta.mode_id.clone(),
            name: meta.name.clone(),
            status: meta.status.to_string(),
            created_at: meta.created_at.clone(),
            updated_at: meta.updated_at.clone(),
            completed_at: meta.completed_at.clone(),
            duration_ms: meta.stats.duration_ms as i64,
            word_count: meta.stats.word_count as i32,
            character_count: meta.stats.character_count as i32,
            directory_path: storage.directory_path(),
            tags: if meta.tags.is_empty() {
                None
            } else {
                Some(serde_json::to_string(&meta.tags)?)
            },
        };

        // 删除旧记录并插入新记录（简单实现）
        self.db.delete_session(&meta.id)?;
        self.db.insert_session(&record)?;

        Ok(())
    }

    /// 更新 Session 状态
    pub fn update_session_status(&self, session_id: &str, status: &str) -> anyhow::Result<()> {
        self.db.update_session_status(session_id, status)
    }

    /// 获取 Session 记录
    pub fn get_session_record(&self, session_id: &str) -> anyhow::Result<Option<SessionRecord>> {
        self.db.get_session(session_id)
    }

    /// 列出 Session 记录
    pub fn list_sessions(&self, limit: Option<u32>, offset: Option<u32>) -> anyhow::Result<Vec<SessionRecord>> {
        self.db.list_sessions(limit, offset)
    }

    /// 删除 Session
    pub fn delete_session(&self, session_id: &str) -> anyhow::Result<()> {
        // 获取记录以找到目录路径
        if let Some(record) = self.db.get_session(session_id)? {
            // 删除文件
            let storage = SessionStorage::open(&record.directory_path)?;
            storage.delete()?;
        }

        // 删除数据库记录
        self.db.delete_session(session_id)?;

        Ok(())
    }

    // ========================================================================
    // 转录相关方法
    // ========================================================================

    /// 追加转录分段
    pub fn append_transcript(&self, storage: &SessionStorage, segment: &TranscriptSegment) -> anyhow::Result<()> {
        storage.append_transcript(segment)
    }

    /// 加载转录分段
    pub fn load_transcript(&self, storage: &SessionStorage) -> anyhow::Result<Vec<TranscriptSegment>> {
        storage.load_transcript()
    }

    // ========================================================================
    // 数据库访问
    // ========================================================================

    /// 获取数据库引用（用于高级查询）
    #[must_use]
    pub fn database(&self) -> &Database {
        &self.db
    }

    // ========================================================================
    // 模式私有数据
    // ========================================================================

    /// 获取模式私有数据目录
    fn get_mode_data_dir(&self, mode_id: &str) -> anyhow::Result<std::path::PathBuf> {
        let modes_dir = get_modes_dir()?;
        Ok(modes_dir.join(mode_id))
    }

    /// 获取模式私有数据文件路径
    fn get_mode_data_path(&self, mode_id: &str) -> anyhow::Result<std::path::PathBuf> {
        Ok(self.get_mode_data_dir(mode_id)?.join("data.json"))
    }

    /// 加载模式私有数据
    pub fn load_mode_data(&self, mode_id: &str) -> anyhow::Result<serde_json::Value> {
        let path = self.get_mode_data_path(mode_id)?;
        if !path.exists() {
            return Ok(serde_json::json!({}));
        }

        let content = std::fs::read_to_string(&path)?;
        let data: serde_json::Value = serde_json::from_str(&content)?;
        Ok(data)
    }

    /// 保存模式私有数据
    pub fn save_mode_data(&self, mode_id: &str, data: &serde_json::Value) -> anyhow::Result<()> {
        let dir = self.get_mode_data_dir(mode_id)?;
        if !dir.exists() {
            std::fs::create_dir_all(&dir)?;
        }

        let path = self.get_mode_data_path(mode_id)?;
        let content = serde_json::to_string_pretty(data)?;
        std::fs::write(&path, content)?;

        tracing::debug!("保存模式数据: mode_id={}, path={}", mode_id, path.display());
        Ok(())
    }

    /// 删除模式私有数据
    pub fn delete_mode_data(&self, mode_id: &str) -> anyhow::Result<()> {
        let dir = self.get_mode_data_dir(mode_id)?;
        if dir.exists() {
            std::fs::remove_dir_all(&dir)?;
            tracing::debug!("删除模式数据: mode_id={}", mode_id);
        }
        Ok(())
    }
}

// 注意：StorageEngine 的测试需要在隔离环境中运行，因为它会创建真实的目录
// 可以在集成测试中进行测试

