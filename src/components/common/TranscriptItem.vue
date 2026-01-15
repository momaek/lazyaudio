<template>
  <div 
    :class="[
      'transcript-item',
      tierClass,
      { 'is-refining': isRefining, 'is-active': isActive }
    ]"
    :data-tier="segment.tier"
    :data-segment-id="segment.id"
  >
    <div class="segment-header">
      <span class="timestamp">{{ formattedTime }}</span>
      
      <!-- 始终显示来源 -->
      <span v-if="segment.source" class="source-badge" :class="`source-${segment.source}`">
        <MaterialIcon v-if="segment.source === 'microphone'" name="mic" size="sm" />
        <MaterialIcon v-else-if="segment.source === 'system'" name="laptop_mac" size="sm" />
        {{ sourceLabel }}
      </span>
      
      <!-- Tier 指示器（仅开发模式） -->
      <span v-if="showDebug" class="tier-badge" :class="`tier-${segment.tier}`">
        {{ tierLabel }}
      </span>
      
      <!-- 置信度指示器（开发模式或显式启用） -->
      <span v-if="showConfidence && segment.confidence" class="confidence-badge">
        {{ (segment.confidence * 100).toFixed(0) }}%
      </span>
    </div>
    
    <p class="segment-text" :class="{ 'partial-text': isActive }">
      {{ displayText }}
      <span v-if="isActive" class="cursor-blink" />
    </p>
    
    <!-- 置信度条（显式启用时） -->
    <div v-if="showConfidence && segment.confidence" class="confidence-bar">
      <div 
        class="confidence-fill"
        :style="{ width: `${segment.confidence * 100}%` }"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import MaterialIcon from './MaterialIcon.vue'
import type { SegmentWithMeta } from '@/composables/useTranscript'

interface Props {
  segment: SegmentWithMeta
  showDebug?: boolean
  showConfidence?: boolean
  isRefining?: boolean
  isActive?: boolean
  partialText?: string
}

const props = withDefaults(defineProps<Props>(), {
  showDebug: false,
  showConfidence: false,
  isRefining: false,
  isActive: false,
  partialText: '',
})

const tierClass = computed(() => ({
  'tier-stream': props.segment.tier === 'tier0',
  'tier-vad': props.segment.tier === 'tier1',
  'tier-refined': props.segment.tier === 'tier2',
}))

const tierLabel = computed(() => {
  const labels = {
    tier0: 'Stream',
    tier1: 'VAD',
    tier2: '✓ 精修',
  }
  return labels[props.segment.tier] || props.segment.tier
})

const sourceLabel = computed(() => {
  if (!props.segment.source) return ''
  const labels: Record<string, string> = {
    microphone: '麦克风',
    system: '系统音频',
    mixed: '混合',
  }
  return labels[props.segment.source] || props.segment.source
})

const formattedTime = computed(() => {
  const minutes = Math.floor(props.segment.startTime / 60)
  const seconds = Math.floor(props.segment.startTime % 60)
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
})

const displayText = computed(() => {
  return props.partialText || props.segment.text
})
</script>

<style scoped>
.transcript-item {
  padding: 12px 16px;
  margin-bottom: 8px;
  border-radius: 8px;
  background: white;
  transition: all 0.3s ease;
  border-left: 3px solid transparent;
}

/* Tier0 (Stream): 临时段落 */
.tier-stream {
  border-left-color: #d1d5db;
}

/* Tier1 (VAD): 正常显示 */
.tier-vad {
  opacity: 1;
  background: white;
  border-left-color: #3b82f6;
}

/* Tier2 (精修): 带轻微高亮 */
.tier-refined {
  opacity: 1;
  background: white;
  border-left-color: #10b981;
}

/* 正在精修动画（Tier 升级） */
.is-refining {
  animation: tier-upgrade 0.6s ease-out;
}

@keyframes tier-upgrade {
  0% { 
    background: inherit;
  }
  30% { 
    background: rgba(59, 130, 246, 0.12);
    transform: scale(1.01);
  }
  100% { 
    background: inherit;
    transform: scale(1);
  }
}

/* 活跃段落样式和动画 */
.transcript-item.is-active {
  background: #f3f4f6;
  border-left-color: #d1d5db;
}

@keyframes active-pulse {
  0%, 100% { 
    opacity: 0.95;
    border-left-color: #6366f1;
  }
  50% { 
    opacity: 1;
    border-left-color: #818cf8;
  }
}

/* 暗色模式支持 */
@media (prefers-color-scheme: dark) {
  .transcript-item {
    background: #1f2937;
    color: #f9fafb;
  }
  
  .tier-stream {
    background: #1f2937;
  }
  
  .tier-vad,
  .tier-refined {
    background: #1f2937;
  }
  
  @keyframes tier-upgrade {
    0% { 
      background: inherit;
    }
    30% { 
      background: rgba(59, 130, 246, 0.15);
      transform: scale(1.01);
    }
    100% { 
      background: inherit;
      transform: scale(1);
    }
  }
  
  .transcript-item.is-active {
    background: #111827;
    border-left-color: #374151;
  }
  
  @keyframes active-pulse {
    0%, 100% { 
      opacity: 0.95;
      border-left-color: #6366f1;
    }
    50% { 
      opacity: 1;
      border-left-color: #818cf8;
    }
  }
}

/* 段落头部 */
.segment-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}

.timestamp {
  font-size: 12px;
  color: #6b7280;
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
  font-weight: 500;
}

@media (prefers-color-scheme: dark) {
  .timestamp {
    color: #9ca3af;
  }
}

/* Badge 通用样式 */
.source-badge,
.tier-badge,
.confidence-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 500;
  border-radius: 12px;
  white-space: nowrap;
}

/* Source Badge - 麦克风（粉色） */
.source-badge.source-microphone {
  background: rgba(236, 72, 153, 0.1);
  color: #db2777;
}

/* Source Badge - 系统音频（紫色） */
.source-badge.source-system {
  background: rgba(168, 85, 247, 0.1);
  color: #9333ea;
}

/* Source Badge - 混合（蓝色） */
.source-badge.source-mixed {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

@media (prefers-color-scheme: dark) {
  .source-badge.source-microphone {
    background: rgba(236, 72, 153, 0.2);
    color: #f9a8d4;
  }
  
  .source-badge.source-system {
    background: rgba(168, 85, 247, 0.2);
    color: #c084fc;
  }
  
  .source-badge.source-mixed {
    background: rgba(59, 130, 246, 0.2);
    color: #60a5fa;
  }
}

/* Tier Badge（开发模式） */
.tier-badge {
  background: #f3f4f6;
  color: #6b7280;
}

.tier-badge.tier-tier0 {
  background: #fef3c7;
  color: #92400e;
}

.tier-badge.tier-tier1 {
  background: #dbeafe;
  color: #1e40af;
}

.tier-badge.tier-tier2 {
  background: #d1fae5;
  color: #065f46;
}

@media (prefers-color-scheme: dark) {
  .tier-badge {
    background: #374151;
    color: #d1d5db;
  }
  
  .tier-badge.tier-tier0 {
    background: rgba(254, 243, 199, 0.2);
    color: #fbbf24;
  }
  
  .tier-badge.tier-tier1 {
    background: rgba(219, 234, 254, 0.2);
    color: #60a5fa;
  }
  
  .tier-badge.tier-tier2 {
    background: rgba(209, 250, 229, 0.2);
    color: #34d399;
  }
}

/* Confidence Badge */
.confidence-badge {
  background: #f3f4f6;
  color: #6b7280;
  font-size: 10px;
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
}

@media (prefers-color-scheme: dark) {
  .confidence-badge {
    background: #374151;
    color: #d1d5db;
  }
}

/* 段落文本 */
.segment-text {
  font-size: 15px;
  line-height: 1.6;
  color: #1f2937;
  margin: 0;
  word-wrap: break-word;
}

/* 活跃段落的临时文本 */
.segment-text.partial-text {
  color: #9ca3af;
  font-style: italic;
}

/* 光标闪烁 */
.cursor-blink {
  display: inline-block;
  width: 2px;
  height: 1em;
  background: #9ca3af;
  margin-left: 2px;
  animation: blink 1s infinite;
  vertical-align: text-bottom;
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

@media (prefers-color-scheme: dark) {
  .segment-text {
    color: #f9fafb;
  }
  
  .segment-text.partial-text {
    color: #9ca3af;
  }
  
  .cursor-blink {
    background: #9ca3af;
  }
}

/* 置信度条 */
.confidence-bar {
  height: 2px;
  background: #e5e7eb;
  border-radius: 1px;
  overflow: hidden;
  margin-top: 8px;
}

.confidence-fill {
  height: 100%;
  background: linear-gradient(to right, #ef4444, #f59e0b, #10b981);
  transition: width 0.3s ease;
}

@media (prefers-color-scheme: dark) {
  .confidence-bar {
    background: #374151;
  }
}

/* 悬停效果 */
.transcript-item:hover {
  background: #f9fafb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

@media (prefers-color-scheme: dark) {
  .transcript-item:hover {
    background: #252f3f;
  }
}

/* 响应式 */
@media (max-width: 640px) {
  .transcript-item {
    padding: 10px 12px;
    margin-bottom: 6px;
  }
  
  .segment-text {
    font-size: 14px;
  }
}
</style>
