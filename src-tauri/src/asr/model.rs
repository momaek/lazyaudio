//! 模型管理模块
//!
//! 管理 ASR 模型的下载、加载和卸载

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use super::types::{AsrError, AsrResult, ModelInfo, ModelType};

/// 预定义的模型列表
/// 格式：(id, name, language, size_mb, type, download_url)
const BUILTIN_MODELS: &[(&str, &str, &str, u64, ModelType, &str)] = &[
    // Zipformer 流式模型
    (
        "sherpa-onnx-streaming-zipformer-zh-14M-2023-02-23",
        "Zipformer 中文流式 (14MB)",
        "zh",
        14,
        ModelType::Streaming,
        "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-zh-14M-2023-02-23.tar.bz2",
    ),
    (
        "sherpa-onnx-streaming-zipformer-en-20M-2023-02-17",
        "Zipformer 英文流式 (20MB)",
        "en",
        20,
        ModelType::Streaming,
        "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-en-20M-2023-02-17.tar.bz2",
    ),
    (
        "sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20",
        "Zipformer 中英双语 (50MB)",
        "zh-en",
        50,
        ModelType::Streaming,
        "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20.tar.bz2",
    ),
    // SenseVoice 模型
    (
        "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17",
        "SenseVoice 多语言 (50MB)",
        "zh-en-ja-ko-yue",
        50,
        ModelType::NonStreaming,
        "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17.tar.bz2",
    ),
];

/// 模型管理器
#[derive(Debug)]
pub struct ModelManager {
    /// 模型存储目录
    models_dir: PathBuf,
    /// 已加载的模型缓存
    model_cache: HashMap<String, LoadedModel>,
}

/// 已加载的模型
#[derive(Debug)]
pub struct LoadedModel {
    /// 模型信息
    pub info: ModelInfo,
    /// 模型文件路径
    pub path: PathBuf,
}

impl ModelManager {
    /// 创建新的模型管理器
    pub fn new(models_dir: PathBuf) -> Self {
        // 确保目录存在
        if !models_dir.exists() {
            std::fs::create_dir_all(&models_dir).ok();
        }

        Self {
            models_dir,
            model_cache: HashMap::new(),
        }
    }

    /// 获取模型目录
    pub fn models_dir(&self) -> &Path {
        &self.models_dir
    }

    /// 列出所有可用模型
    pub fn list_available(&self) -> Vec<ModelInfo> {
        BUILTIN_MODELS
            .iter()
            .map(|(id, name, lang, size, model_type, _url)| {
                let model_path = self.models_dir.join(id);
                let is_downloaded = self.check_model_files(&model_path);

                ModelInfo {
                    id: (*id).to_string(),
                    name: (*name).to_string(),
                    language: (*lang).to_string(),
                    size_mb: *size,
                    is_downloaded,
                    model_type: *model_type,
                    description: None,
                }
            })
            .collect()
    }

    /// 获取模型下载 URL
    pub fn get_download_url(&self, model_id: &str) -> Option<String> {
        BUILTIN_MODELS
            .iter()
            .find(|(id, _, _, _, _, _)| *id == model_id)
            .map(|(_, _, _, _, _, url)| (*url).to_string())
    }

    /// 获取模型信息
    pub fn get_model_info(&self, model_id: &str) -> Option<ModelInfo> {
        self.list_available()
            .into_iter()
            .find(|m| m.id == model_id)
    }

    /// 检查模型是否已下载
    pub fn is_model_downloaded(&self, model_id: &str) -> bool {
        let model_path = self.models_dir.join(model_id);
        self.check_model_files(&model_path)
    }

    /// 获取模型路径
    pub fn get_model_path(&self, model_id: &str) -> AsrResult<PathBuf> {
        let model_path = self.models_dir.join(model_id);

        if !self.check_model_files(&model_path) {
            return Err(AsrError::ModelNotFound(format!(
                "模型 {} 未下载或文件不完整",
                model_id
            )));
        }

        Ok(model_path)
    }

    /// 加载模型
    pub fn load_model(&mut self, model_id: &str) -> AsrResult<&LoadedModel> {
        // 检查缓存
        if self.model_cache.contains_key(model_id) {
            return Ok(self.model_cache.get(model_id).unwrap());
        }

        // 获取模型信息
        let info = self
            .get_model_info(model_id)
            .ok_or_else(|| AsrError::ModelNotFound(format!("未知模型: {}", model_id)))?;

        // 获取模型路径
        let path = self.get_model_path(model_id)?;

        // 创建已加载模型对象
        let loaded = LoadedModel { info, path };

        // 存入缓存
        self.model_cache.insert(model_id.to_string(), loaded);

        Ok(self.model_cache.get(model_id).unwrap())
    }

    /// 卸载模型
    pub fn unload_model(&mut self, model_id: &str) {
        self.model_cache.remove(model_id);
    }

    /// 检查模型文件是否完整
    fn check_model_files(&self, model_path: &Path) -> bool {
        if !model_path.exists() {
            return false;
        }

        // 检查必要的模型文件
        // 流式模型通常包含: encoder, decoder, joiner, tokens
        let required_patterns = ["encoder", "decoder", "joiner", "tokens"];

        for pattern in required_patterns {
            let has_file = std::fs::read_dir(model_path)
                .map(|entries| {
                    entries.filter_map(Result::ok).any(|entry| {
                        entry
                            .file_name()
                            .to_string_lossy()
                            .to_lowercase()
                            .contains(pattern)
                    })
                })
                .unwrap_or(false);

            if !has_file {
                tracing::debug!("模型文件检查: {} 缺少 {}", model_path.display(), pattern);
                return false;
            }
        }

        true
    }

    /// 获取模型文件配置
    ///
    /// 返回模型各组件的文件路径
    pub fn get_model_files(&self, model_id: &str) -> AsrResult<ModelFiles> {
        let model_path = self.get_model_path(model_id)?;

        // 查找各个文件
        let encoder = self.find_file(&model_path, "encoder")?;
        let decoder = self.find_file(&model_path, "decoder")?;
        let joiner = self.find_file(&model_path, "joiner")?;
        let tokens = self.find_file(&model_path, "tokens")?;

        Ok(ModelFiles {
            encoder,
            decoder,
            joiner,
            tokens,
        })
    }

    /// 查找匹配的文件
    fn find_file(&self, dir: &Path, pattern: &str) -> AsrResult<PathBuf> {
        let entries = std::fs::read_dir(dir)?;

        for entry in entries.filter_map(Result::ok) {
            let file_name = entry.file_name().to_string_lossy().to_lowercase();
            if file_name.contains(pattern) {
                return Ok(entry.path());
            }
        }

        Err(AsrError::ModelNotFound(format!(
            "找不到 {} 文件在 {}",
            pattern,
            dir.display()
        )))
    }
}

/// 模型文件路径
#[derive(Debug, Clone)]
pub struct ModelFiles {
    /// 编码器文件路径
    pub encoder: PathBuf,
    /// 解码器文件路径
    pub decoder: PathBuf,
    /// Joiner 文件路径
    pub joiner: PathBuf,
    /// Tokens 文件路径
    pub tokens: PathBuf,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env::temp_dir;

    #[test]
    fn test_model_manager_creation() {
        let dir = temp_dir().join("lazyaudio_test_models");
        let manager = ModelManager::new(dir.clone());
        assert!(manager.models_dir().exists());

        // 清理
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn test_list_available_models() {
        let dir = temp_dir().join("lazyaudio_test_models2");
        let manager = ModelManager::new(dir.clone());
        let models = manager.list_available();

        assert!(!models.is_empty());
        assert!(models.iter().any(|m| m.language == "zh"));
        assert!(models.iter().any(|m| m.language == "en"));

        // 清理
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn test_model_not_downloaded() {
        let dir = temp_dir().join("lazyaudio_test_models3");
        let manager = ModelManager::new(dir.clone());

        // 未下载的模型应该返回 false
        assert!(!manager.is_model_downloaded("sherpa-onnx-streaming-zipformer-zh-14M-2023-02-23"));

        // 清理
        std::fs::remove_dir_all(dir).ok();
    }
}

