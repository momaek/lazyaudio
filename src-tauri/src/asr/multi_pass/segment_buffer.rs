//! 段落缓冲器
//!
//! 缓存语音段落的原始音频数据，供后续层级识别使用

use std::collections::VecDeque;
use std::time::{SystemTime, UNIX_EPOCH};

/// 缓冲段落
#[derive(Debug, Clone)]
pub struct BufferedSegment {
    /// 段落 ID
    pub id: u64,
    
    /// 原始音频数据（16kHz 单声道 f32）
    pub samples: Vec<f32>,
    
    /// 开始时间（秒）
    pub start_time: f64,
    
    /// 结束时间（秒）
    pub end_time: f64,
    
    /// 创建时间戳（毫秒）
    pub created_at: u64,
    
    /// 是否已被 Tier 2 处理
    pub tier2_processed: bool,
    
    /// 是否已被 Tier 3 处理
    pub tier3_processed: bool,
}

impl BufferedSegment {
    /// 创建新的缓冲段落
    pub fn new(id: u64, samples: Vec<f32>, start_time: f64, end_time: f64) -> Self {
        let created_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        Self {
            id,
            samples,
            start_time,
            end_time,
            created_at,
            tier2_processed: false,
            tier3_processed: false,
        }
    }

    /// 获取段落时长（秒）
    pub fn duration(&self) -> f64 {
        self.end_time - self.start_time
    }

    /// 获取音频采样数
    pub fn sample_count(&self) -> usize {
        self.samples.len()
    }
}

/// 段落缓冲器配置
#[derive(Debug, Clone)]
pub struct SegmentBufferConfig {
    /// 最大缓冲段落数
    pub max_buffer_size: usize,
    
    /// 段落保留时间（毫秒）
    pub retention_ms: u64,
}

impl Default for SegmentBufferConfig {
    fn default() -> Self {
        Self {
            max_buffer_size: 100,
            retention_ms: 300_000, // 5 分钟
        }
    }
}

/// 段落缓冲器
pub struct SegmentBuffer {
    /// 配置
    config: SegmentBufferConfig,
    
    /// 缓冲队列
    buffer: VecDeque<BufferedSegment>,
    
    /// 下一个段落 ID
    next_id: u64,
}

impl SegmentBuffer {
    /// 创建新的段落缓冲器
    pub fn new(config: SegmentBufferConfig) -> Self {
        Self {
            config,
            buffer: VecDeque::new(),
            next_id: 1,
        }
    }

    /// 使用默认配置创建
    pub fn with_defaults() -> Self {
        Self::new(SegmentBufferConfig::default())
    }

    /// 添加段落到缓冲区
    pub fn push(&mut self, samples: Vec<f32>, start_time: f64, end_time: f64) -> u64 {
        let id = self.next_id;
        self.next_id += 1;

        let segment = BufferedSegment::new(id, samples, start_time, end_time);
        self.buffer.push_back(segment);

        // 清理过期或超限的段落
        self.cleanup();

        id
    }

    /// 获取待 Tier 2 处理的段落
    pub fn get_pending_tier2(&self, limit: usize) -> Vec<&BufferedSegment> {
        self.buffer
            .iter()
            .filter(|seg| !seg.tier2_processed)
            .take(limit)
            .collect()
    }

    /// 获取待 Tier 3 处理的段落
    pub fn get_pending_tier3(&self, limit: usize) -> Vec<&BufferedSegment> {
        self.buffer
            .iter()
            .filter(|seg| !seg.tier3_processed)
            .take(limit)
            .collect()
    }

    /// 标记段落为 Tier 2 已处理
    pub fn mark_tier2_processed(&mut self, id: u64) {
        if let Some(segment) = self.buffer.iter_mut().find(|seg| seg.id == id) {
            segment.tier2_processed = true;
        }
    }

    /// 标记段落为 Tier 3 已处理
    pub fn mark_tier3_processed(&mut self, id: u64) {
        if let Some(segment) = self.buffer.iter_mut().find(|seg| seg.id == id) {
            segment.tier3_processed = true;
        }
    }

    /// 获取指定 ID 的段落
    pub fn get(&self, id: u64) -> Option<&BufferedSegment> {
        self.buffer.iter().find(|seg| seg.id == id)
    }

    /// 获取缓冲区中的段落总数
    pub fn len(&self) -> usize {
        self.buffer.len()
    }

    /// 清理过期或超限的段落
    fn cleanup(&mut self) {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        // 移除过期的段落
        while let Some(front) = self.buffer.front() {
            if now - front.created_at > self.config.retention_ms {
                self.buffer.pop_front();
            } else {
                break;
            }
        }

        // 如果超过最大大小，移除最旧的段落
        while self.buffer.len() > self.config.max_buffer_size {
            self.buffer.pop_front();
        }
    }

    /// 清空缓冲区
    pub fn clear(&mut self) {
        self.buffer.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_segment_buffer_push() {
        let mut buffer = SegmentBuffer::with_defaults();
        
        let samples = vec![0.0; 16000]; // 1 秒音频
        let id = buffer.push(samples, 0.0, 1.0);
        
        assert_eq!(id, 1);
        assert_eq!(buffer.len(), 1);
    }

    #[test]
    fn test_segment_buffer_pending() {
        let mut buffer = SegmentBuffer::with_defaults();
        
        let samples = vec![0.0; 16000];
        let id1 = buffer.push(samples.clone(), 0.0, 1.0);
        let id2 = buffer.push(samples.clone(), 1.0, 2.0);
        
        let pending = buffer.get_pending_tier2(10);
        assert_eq!(pending.len(), 2);
        
        buffer.mark_tier2_processed(id1);
        let pending = buffer.get_pending_tier2(10);
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].id, id2);
    }

    #[test]
    fn test_segment_buffer_max_size() {
        let config = SegmentBufferConfig {
            max_buffer_size: 5,
            retention_ms: 300_000,
        };
        let mut buffer = SegmentBuffer::new(config);
        
        let samples = vec![0.0; 16000];
        for i in 0..10 {
            buffer.push(samples.clone(), i as f64, (i + 1) as f64);
        }
        
        assert_eq!(buffer.len(), 5);
    }
}

