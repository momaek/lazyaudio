<script setup lang="ts">
import { ref } from 'vue'
import MaterialIcon from '@/components/common/MaterialIcon.vue'
import ProviderBadge from '@/components/common/ProviderBadge.vue'
import { useAsrConfig } from '@/composables/useConfig'

defineProps<{
  isPaused: boolean
  isLoading: boolean
  audioLevel: number
  formattedDuration: string
  audioSourceLabel: string
}>()

const { asrProvider } = useAsrConfig()

const emit = defineEmits<{
  pause: []
  resume: []
  stop: []
  marker: []
  rename: []
}>()

// 搜索栏展开状态
const isSearchExpanded = ref(false)
const searchQuery = ref('')
</script>

<template>
  <div
    class="h-14 flex items-center px-4 shrink-0 border-b"
    style="background-color: var(--la-bg-inset); border-color: var(--la-divider)"
  >
    <!-- 左区：音频源 Pill -->
    <div class="flex items-center gap-3 shrink-0">
      <button
        class="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
        style="background-color: var(--la-bg-surface); color: var(--la-text-secondary)"
      >
        <MaterialIcon name="volume_up" size="sm" />
        {{ audioSourceLabel }}
      </button>
      <ProviderBadge :provider="asrProvider" variant="pill" size="sm" />
    </div>

    <!-- 中区：录制控制 + 时长 -->
    <div class="flex-1 flex items-center justify-center gap-3">
      <!-- 暂停/继续按钮 -->
      <button
        v-if="!isPaused"
        class="size-[34px] rounded-full flex items-center justify-center transition-colors"
        style="background-color: var(--la-bg-surface); color: var(--la-text-secondary)"
        :disabled="isLoading"
        @click="emit('pause')"
      >
        <MaterialIcon name="pause" size="sm" />
      </button>
      <button
        v-else
        class="size-[34px] rounded-full flex items-center justify-center transition-colors"
        style="background-color: var(--la-bg-surface); color: var(--la-text-secondary)"
        :disabled="isLoading"
        @click="emit('resume')"
      >
        <MaterialIcon name="play_arrow" size="sm" />
      </button>

      <!-- 停止按钮 (方形停止图标) -->
      <button
        class="size-10 rounded-full flex items-center justify-center transition-colors"
        style="background-color: var(--la-recording-red)"
        :disabled="isLoading"
        @click="emit('stop')"
      >
        <div class="size-3.5 rounded-sm" style="background-color: white" />
      </button>

      <!-- 时长 -->
      <span
        class="text-sm font-mono font-semibold tabular-nums"
        style="color: var(--la-text-primary)"
      >
        {{ formattedDuration }}
      </span>

      <!-- 录制状态指示 -->
      <span v-if="!isPaused" class="recording-dot" />
      <span
        v-else
        class="text-xs font-medium"
        style="color: var(--la-text-tertiary)"
      >
        已暂停
      </span>
    </div>

    <!-- 右区：音量条 + 搜索 -->
    <div class="flex items-center gap-3 shrink-0">
      <!-- 音量条 -->
      <div class="flex items-center gap-1">
        <MaterialIcon name="graphic_eq" size="sm" style="color: var(--la-text-tertiary)" />
        <div
          class="w-16 h-1.5 rounded-full overflow-hidden"
          style="background-color: var(--la-bg-surface)"
        >
          <div
            class="h-full rounded-full transition-all duration-150"
            style="background-color: var(--la-accent)"
            :style="{ width: `${Math.min(audioLevel, 100)}%` }"
          />
        </div>
      </div>

      <!-- 搜索按钮/搜索栏 -->
      <div class="flex items-center">
        <Transition name="search-expand">
          <input
            v-if="isSearchExpanded"
            v-model="searchQuery"
            class="w-48 h-8 rounded-md px-3 text-xs border-0 outline-none transition-all"
            style="background-color: var(--la-bg-surface); color: var(--la-text-primary)"
            placeholder="搜索转录..."
            autofocus
            @blur="isSearchExpanded = false"
          />
        </Transition>
        <button
          class="size-8 rounded-md flex items-center justify-center transition-colors"
          style="color: var(--la-text-secondary)"
          @click="isSearchExpanded = !isSearchExpanded"
        >
          <MaterialIcon name="search" size="sm" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.search-expand-enter-active {
  transition: width 0.2s ease-out, opacity 0.2s ease-out;
}
.search-expand-leave-active {
  transition: width 0.15s ease-in, opacity 0.15s ease-in;
}
.search-expand-enter-from,
.search-expand-leave-to {
  width: 0;
  opacity: 0;
}
</style>
