<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import MaterialIcon from '@/components/common/MaterialIcon.vue'
import ProviderBadge from '@/components/common/ProviderBadge.vue'
import { ScrollArea } from '@/components/ui/scroll-area'
import TranscriptItem from '@/components/common/TranscriptItem.vue'
import { useScrollAreaAutoScroll } from '@/composables/useAutoScroll'
import { useAsrConfig } from '@/composables/useConfig'
import type { SegmentWithMeta } from '@/composables/useTranscript'

const props = defineProps<{
  segments: SegmentWithMeta[]
  partialText: string
  activeSegmentId: string | null
  activeSegmentPartialText: string
  isProcessing: boolean
  recentlyRefinedIds: Set<string>
  isPaused: boolean
}>()

const { asrProvider } = useAsrConfig()

const scrollAreaRef = ref<InstanceType<typeof ScrollArea> | null>(null)

const segmentsRef = computed(() => props.segments)
const {
  isAutoScrollEnabled,
  showScrollButton,
  scrollToBottom,
  handleScroll,
} = useScrollAreaAutoScroll(scrollAreaRef, segmentsRef)

watch(
  () => props.partialText,
  () => {
    if (isAutoScrollEnabled.value) {
      scrollToBottom()
    }
  }
)
</script>

<template>
  <!-- 转录区 -->
  <ScrollArea ref="scrollAreaRef" class="flex-1 relative" @scroll.native="handleScroll">
    <div class="px-7 py-6 space-y-4">
      <!-- 已固化的段落 -->
      <TranscriptItem
        v-for="segment in segments"
        :key="segment.clientId"
        :segment="segment"
        :is-refining="recentlyRefinedIds.has(segment.clientId)"
        :is-active="activeSegmentId === segment.clientId && !isPaused"
        :partial-text="activeSegmentId === segment.clientId ? activeSegmentPartialText : ''"
      />

      <!-- 空状态 -->
      <div
        v-if="segments.length === 0 && !activeSegmentId && !isPaused"
        class="flex flex-col items-center justify-center py-16 text-center"
      >
        <div
          class="size-12 rounded-full flex items-center justify-center mb-4"
          style="background-color: var(--la-bg-surface)"
        >
          <MaterialIcon name="mic" size="lg" style="color: var(--la-text-tertiary)" />
        </div>
        <p class="text-sm font-medium" style="color: var(--la-text-secondary)">
          正在聆听...
        </p>
        <p class="text-xs mt-1" style="color: var(--la-text-tertiary)">
          开始说话后会自动转录
        </p>
      </div>
    </div>

    <!-- 滚动到底部按钮 -->
    <Transition name="fade">
      <button
        v-if="showScrollButton"
        class="absolute bottom-4 right-4 size-8 rounded-full flex items-center justify-center"
        style="background-color: var(--la-bg-surface); color: var(--la-text-secondary)"
        @click="() => scrollToBottom()"
      >
        <MaterialIcon name="keyboard_arrow_down" size="sm" />
      </button>
    </Transition>
  </ScrollArea>

  <!-- 底部状态栏 -->
  <div
    class="px-4 py-2 flex items-center justify-between text-xs border-t"
    style="
      background-color: var(--la-bg-inset);
      border-color: var(--la-divider);
      color: var(--la-text-tertiary);
    "
  >
    <div class="flex items-center gap-2">
      <ProviderBadge :provider="asrProvider" variant="inline" size="sm" />
      <span style="color: var(--la-divider)">&middot;</span>
      <span v-if="isProcessing" class="flex items-center gap-1">
        <MaterialIcon name="progress_activity" size="sm" class="animate-spin" />
        识别中...
      </span>
      <span v-else>{{ segments.length }} 段转录</span>
    </div>
    <label class="flex items-center gap-2 cursor-pointer">
      <input
        v-model="isAutoScrollEnabled"
        type="checkbox"
        class="rounded"
        style="accent-color: var(--la-accent)"
      />
      自动滚动
    </label>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
