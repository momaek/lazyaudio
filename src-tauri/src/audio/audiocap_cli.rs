//! AudioCapCLI 进程管理模块
//!
//! 封装 AudioCapCLI 命令行工具的进程管理，提供：
//! - 二进制文件定位
//! - 进程启动和停止
//! - stdout 音频数据读取
//! - 进程生命周期管理

use super::format::bytes_to_f32_le;
use super::types::{AudioChunk, AudioError, AudioResult, AudioSource, AudioStreamSender};
use std::io::{BufRead, BufReader, Read};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Instant;
use tauri::Manager;

/// AudioCapCLI 二进制名称
const AUDIOCAP_CLI_NAME: &str = "AudioCapCLI";

/// 默认采样率
const DEFAULT_SAMPLE_RATE: u32 = 48000;

/// 默认通道数
const DEFAULT_CHANNELS: u16 = 2;

/// 每帧字节数 (f32 * 2 channels)
const BYTES_PER_FRAME: usize = 4 * 2;

/// 读取缓冲区大小（约 100ms 的数据）
const READ_BUFFER_SIZE: usize = DEFAULT_SAMPLE_RATE as usize * BYTES_PER_FRAME / 10;

// ============================================================================
// AudioCapCLI 进程管理
// ============================================================================

/// AudioCapCLI 进程封装
pub struct AudioCapProcess {
    /// 子进程
    child: Child,
    /// 是否正在运行
    running: Arc<AtomicBool>,
    /// 读取线程句柄
    read_thread: Option<thread::JoinHandle<()>>,
    /// 采集开始时间
    start_time: Instant,
}

impl AudioCapProcess {
    /// 查找 AudioCapCLI 二进制文件路径
    ///
    /// 按以下顺序查找：
    /// 1. Tauri Sidecar 路径（打包后）
    /// 2. 开发时的 binaries 目录
    /// 3. 系统 PATH
    pub fn find_binary(app_handle: Option<&tauri::AppHandle>) -> AudioResult<PathBuf> {
        // 1. 尝试使用 Tauri Sidecar 路径
        if let Some(handle) = app_handle {
            if let Ok(path) = handle
                .path()
                .resource_dir()
                .map(|p| p.join("binaries").join(Self::binary_name()))
            {
                if path.exists() {
                    tracing::debug!("找到 AudioCapCLI (resource): {:?}", path);
                    return Ok(path);
                }
            }
        }

        // 2. 开发时查找 src-tauri/binaries 目录
        let dev_paths = [
            // 相对于当前工作目录
            PathBuf::from("src-tauri/binaries").join(Self::binary_name()),
            // 相对于 CARGO_MANIFEST_DIR
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("binaries")
                .join(Self::binary_name()),
        ];

        for path in &dev_paths {
            if path.exists() {
                tracing::debug!("找到 AudioCapCLI (dev): {:?}", path);
                return Ok(path.clone());
            }
        }

        // 3. 尝试从 PATH 查找
        if let Ok(output) = Command::new("which").arg(AUDIOCAP_CLI_NAME).output() {
            if output.status.success() {
                let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let path = PathBuf::from(&path_str);
                if path.exists() {
                    tracing::debug!("找到 AudioCapCLI (PATH): {:?}", path);
                    return Ok(path);
                }
            }
        }

        Err(AudioError::Other(format!(
            "未找到 {} 二进制文件",
            AUDIOCAP_CLI_NAME
        )))
    }

    /// 获取当前平台的二进制文件名
    fn binary_name() -> String {
        #[cfg(target_arch = "aarch64")]
        let arch = "aarch64";
        #[cfg(target_arch = "x86_64")]
        let arch = "x86_64";
        #[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64")))]
        let arch = "unknown";

        format!("{}-{}-apple-darwin", AUDIOCAP_CLI_NAME, arch)
    }

    /// 启动系统音频采集
    ///
    /// # Arguments
    /// * `app_handle` - Tauri 应用句柄（用于定位二进制文件）
    /// * `sender` - 音频数据发送通道
    pub fn start_system_capture(
        app_handle: Option<&tauri::AppHandle>,
        sender: AudioStreamSender,
    ) -> AudioResult<Self> {
        let binary_path = Self::find_binary(app_handle)?;
        Self::spawn(&binary_path, &["--system"], sender)
    }

    /// 启动指定应用的音频采集
    ///
    /// # Arguments
    /// * `app_handle` - Tauri 应用句柄
    /// * `source_name` - 应用名称或 Bundle ID
    /// * `sender` - 音频数据发送通道
    pub fn start_app_capture(
        app_handle: Option<&tauri::AppHandle>,
        source_name: &str,
        sender: AudioStreamSender,
    ) -> AudioResult<Self> {
        let binary_path = Self::find_binary(app_handle)?;
        Self::spawn(&binary_path, &["--source", source_name], sender)
    }

    /// 列出可用的音频源
    ///
    /// # Arguments
    /// * `app_handle` - Tauri 应用句柄
    ///
    /// # Returns
    /// 可用音频源列表
    pub fn list_sources(app_handle: Option<&tauri::AppHandle>) -> AudioResult<Vec<AudioSource>> {
        let binary_path = Self::find_binary(app_handle)?;

        let output = Command::new(&binary_path)
            .arg("--list-sources")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .map_err(|e| AudioError::ProcessError(format!("启动 AudioCapCLI 失败: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(AudioError::ProcessError(format!(
                "AudioCapCLI 执行失败: {}",
                stderr
            )));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut sources = Vec::new();

        for line in stdout.lines() {
            if line.trim().is_empty() {
                continue;
            }

            // 格式: AppName|48000 Hz, 2 ch|Base64Icon
            let parts: Vec<&str> = line.split('|').collect();
            if parts.is_empty() {
                continue;
            }

            let name = parts[0].trim().to_string();
            let id = name.clone();

            // 解析格式信息
            let (sample_rate, channels) = if parts.len() > 1 {
                Self::parse_format_info(parts[1])
            } else {
                (DEFAULT_SAMPLE_RATE, DEFAULT_CHANNELS)
            };

            sources.push(AudioSource {
                id,
                name: name.clone(),
                source_type: super::types::AudioSourceType::Application {
                    bundle_id: name,
                    pid: 0, // AudioCapCLI 不返回 PID
                },
                is_default: false,
                sample_rate: Some(sample_rate),
                channels: Some(channels),
            });
        }

        Ok(sources)
    }

    /// 解析格式信息字符串
    fn parse_format_info(format_str: &str) -> (u32, u16) {
        // 格式: "48000 Hz, 2 ch"
        let mut sample_rate = DEFAULT_SAMPLE_RATE;
        let mut channels = DEFAULT_CHANNELS;

        if let Some(hz_pos) = format_str.find("Hz") {
            let rate_str = format_str[..hz_pos].trim();
            if let Ok(rate) = rate_str.parse::<u32>() {
                sample_rate = rate;
            }
        }

        if let Some(ch_pos) = format_str.find("ch") {
            // 向前找数字
            let before_ch = &format_str[..ch_pos];
            if let Some(comma_pos) = before_ch.rfind(',') {
                let ch_str = before_ch[comma_pos + 1..].trim();
                if let Ok(ch) = ch_str.parse::<u16>() {
                    channels = ch;
                }
            }
        }

        (sample_rate, channels)
    }

    /// 启动 AudioCapCLI 进程
    fn spawn(binary_path: &PathBuf, args: &[&str], sender: AudioStreamSender) -> AudioResult<Self> {
        tracing::info!("启动 AudioCapCLI: {:?} {:?}", binary_path, args);

        let mut child = Command::new(binary_path)
            .args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::piped())
            .spawn()
            .map_err(|e| AudioError::ProcessError(format!("启动 AudioCapCLI 失败: {}", e)))?;

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| AudioError::ProcessError("无法获取 stdout".to_string()))?;

        let running = Arc::new(AtomicBool::new(true));
        let running_clone = running.clone();
        let start_time = Instant::now();

        // 启动读取线程
        let read_thread = thread::spawn(move || {
            Self::read_audio_loop(stdout, sender, running_clone, start_time);
        });

        Ok(Self {
            child,
            running,
            read_thread: Some(read_thread),
            start_time,
        })
    }

    /// 音频数据读取循环
    fn read_audio_loop(
        stdout: std::process::ChildStdout,
        sender: AudioStreamSender,
        running: Arc<AtomicBool>,
        start_time: Instant,
    ) {
        let mut reader = BufReader::with_capacity(READ_BUFFER_SIZE, stdout);
        let mut buffer = vec![0u8; READ_BUFFER_SIZE];

        while running.load(Ordering::Relaxed) {
            match reader.read(&mut buffer) {
                Ok(0) => {
                    // EOF，进程已退出
                    tracing::debug!("AudioCapCLI stdout EOF");
                    break;
                }
                Ok(n) => {
                    // 解析 f32 音频数据
                    let samples = bytes_to_f32_le(&buffer[..n]);

                    if samples.is_empty() {
                        continue;
                    }

                    let timestamp_ms = start_time.elapsed().as_millis() as u64;

                    let chunk = AudioChunk::new(
                        samples,
                        timestamp_ms,
                        DEFAULT_SAMPLE_RATE,
                        DEFAULT_CHANNELS,
                    );

                    // 发送到通道
                    if sender.blocking_send(chunk).is_err() {
                        tracing::debug!("音频通道已关闭");
                        break;
                    }
                }
                Err(e) => {
                    if running.load(Ordering::Relaxed) {
                        tracing::error!("读取音频数据失败: {}", e);
                    }
                    break;
                }
            }
        }

        tracing::debug!("音频读取循环结束");
    }

    /// 停止进程
    pub fn stop(&mut self) -> AudioResult<()> {
        tracing::info!("停止 AudioCapCLI");

        // 设置停止标志
        self.running.store(false, Ordering::Relaxed);

        // 关闭 stdin（这会让 AudioCapCLI 退出）
        if let Some(mut stdin) = self.child.stdin.take() {
            drop(stdin);
        }

        // 等待读取线程结束
        if let Some(thread) = self.read_thread.take() {
            let _ = thread.join();
        }

        // 尝试优雅终止进程
        match self.child.try_wait() {
            Ok(Some(_)) => {
                tracing::debug!("AudioCapCLI 已退出");
            }
            Ok(None) => {
                // 进程仍在运行，发送 SIGTERM
                tracing::debug!("发送 SIGTERM 到 AudioCapCLI");
                let _ = self.child.kill();
                let _ = self.child.wait();
            }
            Err(e) => {
                tracing::warn!("检查进程状态失败: {}", e);
                let _ = self.child.kill();
            }
        }

        Ok(())
    }

    /// 检查进程是否仍在运行
    pub fn is_running(&mut self) -> bool {
        match self.child.try_wait() {
            Ok(Some(_)) => false,
            Ok(None) => true,
            Err(_) => false,
        }
    }

    /// 获取采集时长（毫秒）
    pub fn elapsed_ms(&self) -> u64 {
        self.start_time.elapsed().as_millis() as u64
    }
}

impl Drop for AudioCapProcess {
    fn drop(&mut self) {
        if self.running.load(Ordering::Relaxed) {
            let _ = self.stop();
        }
    }
}

// ============================================================================
// 测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_binary_name() {
        let name = AudioCapProcess::binary_name();
        assert!(name.contains("AudioCapCLI"));
        assert!(name.contains("apple-darwin"));
    }

    #[test]
    fn test_parse_format_info() {
        let (rate, ch) = AudioCapProcess::parse_format_info("48000 Hz, 2 ch");
        assert_eq!(rate, 48000);
        assert_eq!(ch, 2);

        let (rate, ch) = AudioCapProcess::parse_format_info("44100 Hz, 1 ch");
        assert_eq!(rate, 44100);
        assert_eq!(ch, 1);
    }
}

