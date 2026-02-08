<script setup lang="ts">
/**
 * ProviderBadge 通用组件
 *
 * 展示当前 ASR Provider 的图标和名称
 *
 * 三种变体：
 * - pill: 圆角胶囊（录制状态栏用）
 * - tag: 小标签（悬浮窗用）
 * - inline: 行内文字（底部状态栏用）
 */

import { computed } from 'vue'
import MaterialIcon from '@/components/common/MaterialIcon.vue'
import { getProviderDisplayName, getProviderIcon, isLocalProvider } from '@/composables/useAsrProvider'
import type { AsrProviderType } from '@/types/bindings'

const props = withDefaults(
  defineProps<{
    provider: AsrProviderType
    variant?: 'pill' | 'tag' | 'inline'
    size?: 'sm' | 'md'
    /** 是否为降级状态 */
    fallback?: boolean
  }>(),
  {
    variant: 'pill',
    size: 'sm',
    fallback: false,
  },
)

// 响应式计算，当 provider prop 变化时自动更新
const displayName = computed(() => getProviderDisplayName(props.provider))
const iconName = computed(() => getProviderIcon(props.provider))
const isLocal = computed(() => isLocalProvider(props.provider))
</script>

<template>
  <!-- Pill 变体 -->
  <span
    v-if="variant === 'pill'"
    class="inline-flex items-center gap-1 rounded-full font-medium"
    :class="size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'"
    :style="{
      backgroundColor: fallback
        ? 'rgba(255,149,0,0.15)'
        : isLocal
          ? 'var(--la-accent-dim)'
          : 'rgba(88,86,214,0.12)',
      color: fallback ? '#ff9500' : isLocal ? 'var(--la-accent)' : '#5856d6',
    }"
  >
    <MaterialIcon :name="fallback ? 'warning' : iconName" size="sm" />
    <span>{{ displayName }}</span>
    <span v-if="fallback" class="opacity-70">(fallback)</span>
  </span>

  <!-- Tag 变体 -->
  <span
    v-else-if="variant === 'tag'"
    class="inline-flex items-center gap-0.5 rounded font-medium"
    :class="size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'"
    :style="{
      backgroundColor: isLocal ? 'var(--la-bg-inset)' : 'rgba(88,86,214,0.08)',
      color: isLocal ? 'var(--la-text-secondary)' : '#5856d6',
    }"
  >
    <MaterialIcon :name="iconName" size="sm" />
    <span>{{ displayName }}</span>
  </span>

  <!-- Inline 变体 -->
  <span
    v-else
    class="inline-flex items-center gap-0.5 text-[10px] font-medium"
    :style="{ color: 'var(--la-text-tertiary)' }"
  >
    <MaterialIcon :name="iconName" size="sm" />
    <span>{{ displayName }}</span>
  </span>
</template>
