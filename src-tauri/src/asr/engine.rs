//! ASR 引擎模块
//!
//! 提供高层 ASR 接口，管理模型和识别器

use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use super::model::{ModelFiles, ModelManager};
use super::recognizer::StreamingRecognizer;
use super::types::{AsrConfig, AsrError, AsrResult, ModelInfo};

/// ASR 引擎
///
/// 管理 ASR 模型和识别器的创建
#[derive(Debug)]
pub struct AsrEngine {
    /// 模型管理器
    model_manager: ModelManager,
    /// 当前配置
    config: AsrConfig,
    /// 当前加载的模型文件
    current_model_files: Option<ModelFiles>,
}

impl AsrEngine {
    /// 创建新的 ASR 引擎
    pub fn new(models_dir: PathBuf, config: AsrConfig) -> Self {
        Self {
            model_manager: ModelManager::new(models_dir),
            config,
            current_model_files: None,
        }
    }

    /// 使用默认配置创建
    pub fn with_defaults(models_dir: PathBuf) -> Self {
        Self::new(models_dir, AsrConfig::default())
    }

    /// 列出可用模型
    pub fn list_models(&self) -> Vec<ModelInfo> {
        self.model_manager.list_available()
    }

    /// 获取模型信息
    pub fn get_model_info(&self, model_id: &str) -> Option<ModelInfo> {
        self.model_manager.get_model_info(model_id)
    }

    /// 获取模型管理器引用
    pub fn model_manager(&self) -> &ModelManager {
        &self.model_manager
    }

    /// 检查模型是否可用（已下载）
    pub fn is_model_available(&self, model_id: &str) -> bool {
        self.model_manager.is_model_downloaded(model_id)
    }

    /// 加载模型
    pub fn load_model(&mut self, model_id: &str) -> AsrResult<()> {
        // 获取模型文件
        let model_files = self.model_manager.get_model_files(model_id)?;
        self.current_model_files = Some(model_files);
        self.config.model_id = model_id.to_string();

        tracing::info!("ASR 模型已加载: {}", model_id);
        Ok(())
    }

    /// 创建流式识别器
    pub fn create_recognizer(&self) -> AsrResult<StreamingRecognizer> {
        let model_files = self
            .current_model_files
            .as_ref()
            .ok_or_else(|| AsrError::ConfigError("未加载模型".to_string()))?;

        StreamingRecognizer::from_model_files(model_files, self.config.clone())
    }

    /// 获取当前配置
    pub fn config(&self) -> &AsrConfig {
        &self.config
    }

    /// 更新配置
    pub fn set_config(&mut self, config: AsrConfig) {
        self.config = config;
    }

    /// 获取模型目录
    pub fn models_dir(&self) -> &std::path::Path {
        self.model_manager.models_dir()
    }
}

/// 共享的 ASR 引擎（线程安全）
pub type SharedAsrEngine = Arc<RwLock<AsrEngine>>;

/// 创建共享的 ASR 引擎
pub fn create_shared_engine(models_dir: PathBuf, config: AsrConfig) -> SharedAsrEngine {
    Arc::new(RwLock::new(AsrEngine::new(models_dir, config)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env::temp_dir;

    #[test]
    fn test_engine_creation() {
        let dir = temp_dir().join("lazyaudio_asr_test");
        let engine = AsrEngine::with_defaults(dir.clone());

        assert!(!engine.list_models().is_empty());

        // 清理
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn test_engine_config() {
        let dir = temp_dir().join("lazyaudio_asr_test2");
        let mut engine = AsrEngine::with_defaults(dir.clone());

        let mut config = engine.config().clone();
        config.language = "en".to_string();
        engine.set_config(config);

        assert_eq!(engine.config().language, "en");

        // 清理
        std::fs::remove_dir_all(dir).ok();
    }
}

