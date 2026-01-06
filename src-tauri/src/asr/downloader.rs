//! 模型下载模块

use std::path::{Path, PathBuf};
use futures_util::StreamExt;
use tokio::io::AsyncWriteExt;

use super::types::{AsrError, AsrResult};

/// 下载进度回调
pub type ProgressCallback = Box<dyn Fn(u64, Option<u64>) + Send + Sync>;

/// 模型下载器
pub struct ModelDownloader {
    /// HTTP 客户端
    client: reqwest::Client,
}

impl ModelDownloader {
    /// 创建新的下载器
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(300))
            .build()
            .expect("Failed to create HTTP client");

        Self { client }
    }

    /// 下载模型
    ///
    /// # Arguments
    /// * `url` - 模型下载 URL
    /// * `dest_dir` - 目标目录
    /// * `progress_callback` - 进度回调函数
    pub async fn download_model(
        &self,
        url: &str,
        dest_dir: &Path,
        progress_callback: Option<ProgressCallback>,
    ) -> AsrResult<PathBuf> {
        tracing::info!("开始下载模型: {}", url);

        // 确保目标目录存在
        tokio::fs::create_dir_all(dest_dir)
            .await
            .map_err(|e| AsrError::IoError(e))?;

        // 提取文件名
        let filename = url
            .rsplit('/')
            .next()
            .ok_or_else(|| AsrError::Other("Invalid URL".to_string()))?;
        let dest_file = dest_dir.join(filename);

        // 发起下载请求
        let response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| AsrError::Other(format!("下载请求失败: {}", e)))?;

        if !response.status().is_success() {
            return Err(AsrError::Other(format!(
                "下载失败: HTTP {}",
                response.status()
            )));
        }

        // 获取文件大小
        let total_size = response.content_length();
        tracing::info!("文件大小: {:?} bytes", total_size);

        // 创建文件
        let mut file = tokio::fs::File::create(&dest_file)
            .await
            .map_err(|e| AsrError::IoError(e))?;

        // 下载文件
        let mut downloaded = 0u64;
        let mut stream = response.bytes_stream();

        while let Some(chunk_result) = stream.next().await {
            let chunk = chunk_result
                .map_err(|e| AsrError::Other(format!("下载数据失败: {}", e)))?;

            file.write_all(&chunk)
                .await
                .map_err(|e| AsrError::IoError(e))?;

            downloaded += chunk.len() as u64;

            // 调用进度回调
            if let Some(ref callback) = progress_callback {
                callback(downloaded, total_size);
            }
        }

        file.flush().await.map_err(|e| AsrError::IoError(e))?;

        tracing::info!("模型下载完成: {:?}", dest_file);
        Ok(dest_file)
    }

    /// 解压 tar.bz2 文件
    pub async fn extract_tar_bz2(&self, archive_path: &Path, dest_dir: &Path) -> AsrResult<()> {
        tracing::info!("开始解压: {:?}", archive_path);

        // 在阻塞线程中执行解压操作
        let archive_path_clone = archive_path.to_path_buf();
        let dest_dir = dest_dir.to_path_buf();

        tokio::task::spawn_blocking(move || {
            // 打开压缩文件，使用 bzip2 解码
            let tar_file = std::fs::File::open(&archive_path_clone)
                .map_err(|e| AsrError::IoError(e))?;
            let bz_decoder = bzip2::read::BzDecoder::new(tar_file);
            
            // 创建 tar 归档读取器
            let mut archive = tar::Archive::new(bz_decoder);

            // 解压到目标目录
            archive
                .unpack(&dest_dir)
                .map_err(|e| AsrError::Other(format!("解压失败: {}", e)))?;

            tracing::info!("解压完成: {:?}", dest_dir);
            Ok::<(), AsrError>(())
        })
        .await
        .map_err(|e| AsrError::Other(format!("解压任务失败: {}", e)))??;

        // 删除压缩文件
        tokio::fs::remove_file(archive_path)
            .await
            .map_err(|e| AsrError::IoError(e))?;

        Ok(())
    }

    /// 下载并安装模型
    ///
    /// 完整流程：下载 -> 解压 -> 验证
    pub async fn download_and_install(
        &self,
        url: &str,
        models_dir: &Path,
        progress_callback: Option<ProgressCallback>,
    ) -> AsrResult<PathBuf> {
        let filename = url
            .rsplit('/')
            .next()
            .ok_or_else(|| AsrError::Other("Invalid URL".to_string()))?;

        // 检查是否是单个 .onnx 文件（如 VAD 模型）
        if filename.ends_with(".onnx") {
            return self.download_single_file(url, models_dir, filename, progress_callback).await;
        }

        // 下载到临时目录
        let temp_dir = models_dir.join(".downloading");
        tokio::fs::create_dir_all(&temp_dir)
            .await
            .map_err(|e| AsrError::IoError(e))?;

        // 下载文件
        let archive_path = self.download_model(url, &temp_dir, progress_callback).await?;

        // 解压到 models 目录
        self.extract_tar_bz2(&archive_path, models_dir).await?;

        // 清理临时目录
        tokio::fs::remove_dir_all(&temp_dir)
            .await
            .ok();

        // 从 URL 提取模型 ID（去掉 .tar.bz2 后缀）
        let model_id = filename.trim_end_matches(".tar.bz2");
        let model_path = models_dir.join(model_id);

        tracing::info!("模型安装完成: {:?}", model_path);
        Ok(model_path)
    }

    /// 下载单个文件（用于 VAD 等单文件模型）
    async fn download_single_file(
        &self,
        url: &str,
        models_dir: &Path,
        filename: &str,
        progress_callback: Option<ProgressCallback>,
    ) -> AsrResult<PathBuf> {
        // 创建模型目录（使用文件名去掉扩展名作为目录名）
        let model_id = filename.trim_end_matches(".onnx");
        let model_dir = models_dir.join(model_id);
        tokio::fs::create_dir_all(&model_dir)
            .await
            .map_err(|e| AsrError::IoError(e))?;

        // 直接下载到模型目录
        let dest_file = model_dir.join(filename);

        // 发起下载请求
        let response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| AsrError::Other(format!("下载请求失败: {}", e)))?;

        if !response.status().is_success() {
            return Err(AsrError::Other(format!(
                "下载失败: HTTP {}",
                response.status()
            )));
        }

        let total_size = response.content_length();
        tracing::info!("VAD 模型大小: {:?} bytes", total_size);

        let mut file = tokio::fs::File::create(&dest_file)
            .await
            .map_err(|e| AsrError::IoError(e))?;

        let mut downloaded = 0u64;
        let mut stream = response.bytes_stream();

        while let Some(chunk_result) = stream.next().await {
            let chunk = chunk_result
                .map_err(|e| AsrError::Other(format!("下载数据失败: {}", e)))?;

            file.write_all(&chunk)
                .await
                .map_err(|e| AsrError::IoError(e))?;

            downloaded += chunk.len() as u64;

            if let Some(ref callback) = progress_callback {
                callback(downloaded, total_size);
            }
        }

        file.flush().await.map_err(|e| AsrError::IoError(e))?;

        tracing::info!("VAD 模型下载完成: {:?}", model_dir);
        Ok(model_dir)
    }
}

impl Default for ModelDownloader {
    fn default() -> Self {
        Self::new()
    }
}

