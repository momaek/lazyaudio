//! `SQLite` 数据库模块
//!
//! 管理数据库连接和表结构

#![allow(clippy::missing_errors_doc)]

use rusqlite::{Connection, Result as SqliteResult};
use std::path::Path;
use std::sync::{Arc, Mutex};

use super::get_db_path;

/// 数据库管理器
#[derive(Debug)]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    /// 打开或创建数据库
    pub fn open() -> anyhow::Result<Self> {
        let path = get_db_path()?;
        Self::open_at(&path)
    }

    /// 在指定路径打开数据库
    pub fn open_at(path: &Path) -> anyhow::Result<Self> {
        // 确保目录存在
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                std::fs::create_dir_all(parent)?;
            }
        }

        let conn = Connection::open(path)?;

        // 启用外键约束
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;

        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };

        // 初始化表结构
        db.init_schema()?;

        tracing::info!("数据库已打开: {}", path.display());
        Ok(db)
    }

    /// 初始化数据库 Schema
    fn init_schema(&self) -> anyhow::Result<()> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("{e}"))?;

        conn.execute_batch(
            r"
            -- 数据库版本管理
            CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            -- Session 索引表
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                mode_id TEXT NOT NULL,
                name TEXT,
                status TEXT NOT NULL CHECK (status IN ('created', 'recording', 'paused', 'completed', 'error')),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                completed_at TEXT,
                duration_ms INTEGER DEFAULT 0,
                word_count INTEGER DEFAULT 0,
                character_count INTEGER DEFAULT 0,
                directory_path TEXT NOT NULL,
                tags TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_sessions_mode_id ON sessions(mode_id);
            CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
            CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at DESC);

            -- 转录全文搜索表 (FTS5)
            CREATE VIRTUAL TABLE IF NOT EXISTS transcripts_fts USING fts5(
                session_id,
                segment_id,
                text,
                start_time,
                content='',
                tokenize='unicode61'
            );

            -- AI 任务记录表
            CREATE TABLE IF NOT EXISTS ai_tasks (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                task_type TEXT NOT NULL,
                status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
                priority INTEGER DEFAULT 50,
                input_data TEXT,
                result TEXT,
                error TEXT,
                created_at TEXT NOT NULL,
                started_at TEXT,
                completed_at TEXT,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_ai_tasks_session_id ON ai_tasks(session_id);
            CREATE INDEX IF NOT EXISTS idx_ai_tasks_status ON ai_tasks(status);

            -- 触发器：更新 sessions.updated_at
            CREATE TRIGGER IF NOT EXISTS sessions_update_timestamp
            AFTER UPDATE ON sessions
            BEGIN
                UPDATE sessions SET updated_at = datetime('now') WHERE id = NEW.id;
            END;
            ",
        )?;

        // 检查并记录 schema 版本
        let version: Option<i32> = conn
            .query_row(
                "SELECT MAX(version) FROM schema_version",
                [],
                |row| row.get(0),
            )
            .ok();

        if version.is_none() {
            conn.execute(
                "INSERT INTO schema_version (version) VALUES (?)",
                [1],
            )?;
            tracing::info!("数据库 schema 初始化完成，版本: 1");
        }

        Ok(())
    }

    /// 获取数据库连接（用于执行自定义查询）
    #[must_use]
    pub fn connection(&self) -> Arc<Mutex<Connection>> {
        Arc::clone(&self.conn)
    }

    /// 插入 Session 记录
    pub fn insert_session(&self, record: &SessionRecord) -> anyhow::Result<()> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("{e}"))?;

        conn.execute(
            r"
            INSERT INTO sessions (
                id, mode_id, name, status, created_at, updated_at,
                completed_at, duration_ms, word_count, character_count,
                directory_path, tags
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ",
            rusqlite::params![
                record.id,
                record.mode_id,
                record.name,
                record.status,
                record.created_at,
                record.updated_at,
                record.completed_at,
                record.duration_ms,
                record.word_count,
                record.character_count,
                record.directory_path,
                record.tags,
            ],
        )?;

        Ok(())
    }

    /// 更新 Session 状态
    pub fn update_session_status(&self, id: &str, status: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("{e}"))?;

        conn.execute(
            "UPDATE sessions SET status = ? WHERE id = ?",
            rusqlite::params![status, id],
        )?;

        Ok(())
    }

    /// 获取 Session 记录
    pub fn get_session(&self, id: &str) -> anyhow::Result<Option<SessionRecord>> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("{e}"))?;

        let result = conn.query_row(
            r"
            SELECT id, mode_id, name, status, created_at, updated_at,
                   completed_at, duration_ms, word_count, character_count,
                   directory_path, tags
            FROM sessions WHERE id = ?
            ",
            [id],
            |row| {
                Ok(SessionRecord {
                    id: row.get(0)?,
                    mode_id: row.get(1)?,
                    name: row.get(2)?,
                    status: row.get(3)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                    completed_at: row.get(6)?,
                    duration_ms: row.get(7)?,
                    word_count: row.get(8)?,
                    character_count: row.get(9)?,
                    directory_path: row.get(10)?,
                    tags: row.get(11)?,
                })
            },
        );

        match result {
            Ok(record) => Ok(Some(record)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// 列出 Session 记录
    pub fn list_sessions(&self, limit: Option<u32>, offset: Option<u32>) -> anyhow::Result<Vec<SessionRecord>> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("{e}"))?;

        let limit = limit.unwrap_or(100);
        let offset = offset.unwrap_or(0);

        let mut stmt = conn.prepare(
            r"
            SELECT id, mode_id, name, status, created_at, updated_at,
                   completed_at, duration_ms, word_count, character_count,
                   directory_path, tags
            FROM sessions
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            ",
        )?;

        let records = stmt
            .query_map([limit, offset], |row| {
                Ok(SessionRecord {
                    id: row.get(0)?,
                    mode_id: row.get(1)?,
                    name: row.get(2)?,
                    status: row.get(3)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                    completed_at: row.get(6)?,
                    duration_ms: row.get(7)?,
                    word_count: row.get(8)?,
                    character_count: row.get(9)?,
                    directory_path: row.get(10)?,
                    tags: row.get(11)?,
                })
            })?
            .collect::<SqliteResult<Vec<_>>>()?;

        Ok(records)
    }

    /// 删除 Session 记录
    pub fn delete_session(&self, id: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("{e}"))?;
        conn.execute("DELETE FROM sessions WHERE id = ?", [id])?;
        Ok(())
    }
}

/// 数据库中的 Session 记录
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SessionRecord {
    pub id: String,
    pub mode_id: String,
    pub name: Option<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
    pub duration_ms: i64,
    pub word_count: i32,
    pub character_count: i32,
    pub directory_path: String,
    pub tags: Option<String>,
}

impl SessionRecord {
    /// 解析 tags JSON 数组
    #[must_use]
    pub fn tags_vec(&self) -> Vec<String> {
        self.tags
            .as_ref()
            .and_then(|t| serde_json::from_str(t).ok())
            .unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_database_init() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("test.db");
        let db = Database::open_at(&path).unwrap();
        assert!(path.exists());
        drop(db);
    }

    #[test]
    fn test_session_crud() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("test.db");
        let db = Database::open_at(&path).unwrap();

        let record = SessionRecord {
            id: "test-id".to_string(),
            mode_id: "meeting".to_string(),
            name: Some("Test Session".to_string()),
            status: "created".to_string(),
            created_at: "2025-01-01T00:00:00Z".to_string(),
            updated_at: "2025-01-01T00:00:00Z".to_string(),
            completed_at: None,
            duration_ms: 0,
            word_count: 0,
            character_count: 0,
            directory_path: "/path/to/session".to_string(),
            tags: None,
        };

        db.insert_session(&record).unwrap();

        let loaded = db.get_session("test-id").unwrap().unwrap();
        assert_eq!(loaded.id, "test-id");
        assert_eq!(loaded.mode_id, "meeting");

        db.update_session_status("test-id", "recording").unwrap();
        let updated = db.get_session("test-id").unwrap().unwrap();
        assert_eq!(updated.status, "recording");

        db.delete_session("test-id").unwrap();
        let deleted = db.get_session("test-id").unwrap();
        assert!(deleted.is_none());
    }
}

