//! 结果合并器
//!
//! 管理多级识别结果，自动选择最佳版本

use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use crate::asr::types::{MultiPassResult, RecognitionResult, RecognitionTier};

/// 结果更新回调类型
pub type ResultUpdateCallback = Arc<dyn Fn(u64, &MultiPassResult) + Send + Sync>;

/// 结果合并器
pub struct ResultMerger {
    /// 存储所有段落的多级识别结果
    results: Arc<RwLock<HashMap<u64, MultiPassResult>>>,
    
    /// 结果更新回调（使用 RwLock 实现内部可变性）
    on_update: Arc<RwLock<Option<ResultUpdateCallback>>>,
}

impl ResultMerger {
    /// 创建新的结果合并器
    pub fn new() -> Self {
        Self {
            results: Arc::new(RwLock::new(HashMap::new())),
            on_update: Arc::new(RwLock::new(None)),
        }
    }

    /// 设置结果更新回调
    pub fn set_update_callback(&self, callback: ResultUpdateCallback) {
        let mut on_update = self.on_update.write().unwrap();
        *on_update = Some(callback);
    }

    /// 添加 Tier 1 结果（初始结果）
    pub fn add_tier1_result(&self, segment_id: u64, result: RecognitionResult) {
        let multi_result = MultiPassResult::new(segment_id, result);
        
        {
            let mut results = self.results.write().unwrap();
            results.insert(segment_id, multi_result.clone());
        }

        // 触发回调
        if let Some(ref callback) = *self.on_update.read().unwrap() {
            callback(segment_id, &multi_result);
        }
    }

    /// 更新指定层级的结果
    pub fn update_tier_result(
        &self,
        segment_id: u64,
        tier: RecognitionTier,
        result: RecognitionResult,
    ) {
        let mut results = self.results.write().unwrap();
        
        if let Some(multi_result) = results.get_mut(&segment_id) {
            multi_result.update_tier(tier, result);
            
            // 如果是 Tier 2 或 Tier 3，标记为完全处理
            if tier == RecognitionTier::Tier2 || tier == RecognitionTier::Tier3 {
                multi_result.is_fully_processed = true;
            }
            
            // 触发回调
            if let Some(ref callback) = *self.on_update.read().unwrap() {
                callback(segment_id, multi_result);
            }
        }
    }

    /// 获取指定段落的结果
    pub fn get_result(&self, segment_id: u64) -> Option<MultiPassResult> {
        let results = self.results.read().unwrap();
        results.get(&segment_id).cloned()
    }

    /// 获取最佳结果（最高层级）
    pub fn get_best_result(&self, segment_id: u64) -> Option<RecognitionResult> {
        let results = self.results.read().unwrap();
        results.get(&segment_id).map(|r| r.best_result.clone())
    }

    /// 获取所有结果
    pub fn get_all_results(&self) -> Vec<MultiPassResult> {
        let results = self.results.read().unwrap();
        results.values().cloned().collect()
    }

    /// 获取待处理的段落 ID 列表
    pub fn get_unprocessed_segments(&self) -> Vec<u64> {
        let results = self.results.read().unwrap();
        results
            .iter()
            .filter(|(_, r)| !r.is_fully_processed)
            .map(|(id, _)| *id)
            .collect()
    }

    /// 清理指定段落的结果
    pub fn remove_result(&self, segment_id: u64) {
        let mut results = self.results.write().unwrap();
        results.remove(&segment_id);
    }

    /// 清空所有结果
    pub fn clear(&self) {
        let mut results = self.results.write().unwrap();
        results.clear();
    }

    /// 获取结果数量
    pub fn len(&self) -> usize {
        let results = self.results.read().unwrap();
        results.len()
    }

    /// 检查是否为空
    pub fn is_empty(&self) -> bool {
        let results = self.results.read().unwrap();
        results.is_empty()
    }
}

impl Default for ResultMerger {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_result_merger_basic() {
        let merger = ResultMerger::new();
        
        let result = RecognitionResult::final_result("测试文本".to_string(), 0.9, 1000);
        merger.add_tier1_result(1, result);
        
        assert_eq!(merger.len(), 1);
        
        let multi_result = merger.get_result(1).unwrap();
        assert_eq!(multi_result.segment_id, 1);
        assert_eq!(multi_result.current_tier, RecognitionTier::Tier1);
    }

    #[test]
    fn test_result_merger_update() {
        let merger = ResultMerger::new();
        
        let tier1_result = RecognitionResult::final_result("测试文本".to_string(), 0.8, 1000);
        merger.add_tier1_result(1, tier1_result);
        
        let tier2_result = RecognitionResult::final_result("修正后的文本".to_string(), 0.95, 2000);
        merger.update_tier_result(1, RecognitionTier::Tier2, tier2_result);
        
        let multi_result = merger.get_result(1).unwrap();
        assert_eq!(multi_result.current_tier, RecognitionTier::Tier2);
        assert_eq!(multi_result.best_result.text, "修正后的文本");
        assert!(multi_result.is_fully_processed);
    }

    #[test]
    fn test_result_merger_callback() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        
        let mut merger = ResultMerger::new();
        let call_count = Arc::new(AtomicUsize::new(0));
        let call_count_clone = call_count.clone();
        
        merger.set_update_callback(Arc::new(move |_id, _result| {
            call_count_clone.fetch_add(1, Ordering::SeqCst);
        }));
        
        let result = RecognitionResult::final_result("测试".to_string(), 0.9, 1000);
        merger.add_tier1_result(1, result);
        
        assert_eq!(call_count.load(Ordering::SeqCst), 1);
    }
}

