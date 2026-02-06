<template>
  <div
    :class="[
      'transcript-item',
      { 'is-refining': isRefining, 'is-active': isActive },
    ]"
    :data-tier="segment.tier"
    :data-segment-id="segment.id"
  >
    <div class="segment-header">
      <!-- 头像占位 -->
      <div class="avatar">
        <MaterialIcon
          v-if="segment.source === 'microphone'"
          name="mic"
          size="sm"
        />
        <MaterialIcon v-else name="laptop_mac" size="sm" />
      </div>

      <div class="header-info">
        <span class="source-name">{{ sourceLabel }}</span>
        <span class="timestamp">{{ formattedTime }}</span>
      </div>

      <!-- Tier 指示器（仅开发模式） -->
      <span
        v-if="showDebug"
        class="tier-badge"
        :class="`tier-${segment.tier}`"
      >
        {{ tierLabel }}
      </span>

      <!-- 置信度指示器（开发模式或显式启用） -->
      <span
        v-if="showConfidence && segment.confidence"
        class="confidence-badge"
      >
        {{ (segment.confidence * 100).toFixed(0) }}%
      </span>
    </div>

    <!-- 文本气泡 -->
    <div class="segment-bubble">
      <p class="segment-text" :class="{ 'partial-text': isActive }">
        {{ displayText }}
        <span v-if="isActive" class="cursor-blink" />
      </p>
    </div>

    <!-- 置信度条（显式启用时） -->
    <div
      v-if="showConfidence && segment.confidence"
      class="confidence-bar"
    >
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

const tierLabel = computed(() => {
  const labels = {
    tier0: 'Stream',
    tier1: 'VAD',
    tier2: '✓ Refined',
  }
  return labels[props.segment.tier] || props.segment.tier
})

const sourceLabel = computed(() => {
  if (!props.segment.source) return '未知'
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
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: all 0.2s ease;
}

/* 段落头部 */
.segment-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 头像 */
.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--la-bg-inset);
  color: var(--la-text-secondary);
  flex-shrink: 0;
}

.header-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.source-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--la-text-primary);
}

.timestamp {
  font-size: 12px;
  color: var(--la-text-tertiary);
  font-family: 'JetBrains Mono', 'SF Mono', monospace;
  font-weight: 500;
}

/* 文本气泡 */
.segment-bubble {
  background-color: var(--la-bg-surface);
  border-radius: 10px;
  padding: 12px 16px;
  margin-left: 40px; /* 对齐头像 */
}

/* 段落文本 */
.segment-text {
  font-size: 15px;
  line-height: 1.6;
  color: var(--la-text-primary);
  margin: 0;
  word-wrap: break-word;
}

/* 活跃段落的临时文本 */
.segment-text.partial-text {
  color: var(--la-text-secondary);
}

/* 光标闪烁 */
.cursor-blink {
  display: inline-block;
  width: 2px;
  height: 1em;
  background: var(--la-accent);
  margin-left: 2px;
  animation: blink 1s infinite;
  vertical-align: text-bottom;
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

/* Badge 通用样式 */
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
  background-color: var(--la-bg-surface);
  color: var(--la-text-secondary);
}

/* Tier Badge 颜色 */
.tier-badge.tier-tier0 {
  color: var(--la-text-tertiary);
}

.tier-badge.tier-tier1 {
  color: var(--la-tier1-blue);
}

.tier-badge.tier-tier2 {
  color: var(--la-tier2-green);
}

/* Confidence Badge */
.confidence-badge {
  font-size: 10px;
  font-family: 'JetBrains Mono', 'SF Mono', monospace;
}

/* 置信度条 */
.confidence-bar {
  height: 2px;
  background: var(--la-border);
  border-radius: 1px;
  overflow: hidden;
  margin-top: 4px;
  margin-left: 40px;
}

.confidence-fill {
  height: 100%;
  background: var(--la-accent);
  transition: width 0.3s ease;
}

/* 正在精修动画 */
.is-refining {
  animation: tier-upgrade 0.6s ease-out;
}

@keyframes tier-upgrade {
  0% { background: inherit; }
  30% { background: color-mix(in srgb, var(--la-tier1-blue) 12%, transparent); transform: scale(1.005); }
  100% { background: inherit; transform: scale(1); }
}

/* 活跃段落样式 */
.transcript-item.is-active .segment-bubble {
  background-color: var(--la-bg-inset);
}

/* 悬停效果（不使用阴影，仅背景色变化） */
.transcript-item:hover .segment-bubble {
  background-color: var(--la-bg-inset);
}
</style>
