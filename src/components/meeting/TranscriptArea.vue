<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useAutoScroll } from '@/composables/useAutoScroll'
import MaterialIcon from '@/components/common/MaterialIcon.vue'
import type { SegmentWithMeta } from '@/composables/useTranscript'

const props = defineProps<{
  segments: SegmentWithMeta[]
  partialText?: string
  activeSegmentId?: string
  activeSegmentPartialText?: string
  isProcessing?: boolean
  isPaused?: boolean
}>()

// 滚动容器
const scrollContainerRef = ref<HTMLElement | null>(null)
const { showScrollButton, scrollToBottom, handleScroll } = useAutoScroll(scrollContainerRef)

// 格式化时间戳
function formatTimestamp(startTime: number): string {
  const totalSeconds = Math.floor(startTime)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

// 从 source 获取来源标签
function getSourceLabel(source?: string | null): string {
  if (!source) return '未知'
  const labels: Record<string, string> = {
    microphone: '麦克风',
    systemAudio: '系统音频',
    system: '系统音频',
    mixed: '混合',
  }
  return labels[source] || source
}

// 监听转录变化，自动滚动
watch(
  () => [props.segments, props.partialText],
  () => {
    nextTick(() => {
      const container = scrollContainerRef.value
      if (container && !props.isPaused) {
        const isNearBottom =
          container.scrollHeight - container.scrollTop - container.clientHeight < 100
        if (isNearBottom) {
          scrollToBottom()
        }
      }
    })
  },
  { deep: true }
)
</script>

<template>
  <div class="flex-1 flex flex-col overflow-hidden" style="background-color: var(--la-bg-primary)">
    <!-- 转录内容滚动区 -->
    <div
      ref="scrollContainerRef"
      class="flex-1 overflow-y-auto px-7 py-6 custom-scrollbar"
      @scroll="handleScroll"
    >
      <div class="max-w-4xl mx-auto space-y-6 pb-12">
        <!-- 转录段落 -->
        <div
          v-for="segment in segments"
          :key="segment.clientId"
          class="flex gap-4 group"
        >
          <!-- 时间戳列 -->
          <div class="w-14 pt-1 shrink-0 text-right">
            <span
              class="text-xs font-mono"
              :style="{
                color:
                  segment.clientId === activeSegmentId
                    ? 'var(--la-accent)'
                    : 'var(--la-text-tertiary)',
                fontWeight: segment.clientId === activeSegmentId ? '600' : '500',
              }"
            >
              {{ formatTimestamp(segment.startTime) }}
            </span>
          </div>

          <!-- 内容列 -->
          <div class="flex-1">
            <!-- 来源标签 -->
            <div class="flex items-center gap-2 mb-2">
              <div
                class="size-8 rounded-full flex items-center justify-center"
                style="background-color: var(--la-bg-inset); color: var(--la-text-secondary)"
              >
                <MaterialIcon
                  v-if="segment.source === 'microphone'"
                  name="mic"
                  size="sm"
                />
                <MaterialIcon v-else name="laptop_mac" size="sm" />
              </div>
              <span class="text-sm font-medium" style="color: var(--la-text-primary)">
                {{ getSourceLabel(segment.source) }}
              </span>
            </div>

            <!-- 气泡 -->
            <div
              class="p-4 rounded-[10px] leading-relaxed transition-colors"
              :style="
                segment.clientId === activeSegmentId
                  ? { backgroundColor: 'var(--la-bg-inset)' }
                  : { backgroundColor: 'var(--la-bg-surface)' }
              "
            >
              <span style="color: var(--la-text-primary)">{{ segment.text }}</span>

              <!-- 活跃段落的临时文本 -->
              <span
                v-if="segment.clientId === activeSegmentId && activeSegmentPartialText"
                style="color: var(--la-text-secondary)"
              >
                {{ ' ' + activeSegmentPartialText }}
              </span>

              <!-- 脉动光标 -->
              <span
                v-if="segment.clientId === activeSegmentId && !isPaused"
                class="inline-block w-0.5 h-4 ml-1 animate-recording-blink align-middle"
                style="background-color: var(--la-accent)"
              />
            </div>
          </div>
        </div>

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
          <p class="text-sm font-medium" style="color: var(--la-text-secondary)">正在聆听...</p>
          <p class="text-xs mt-1" style="color: var(--la-text-tertiary)">
            开始说话后会自动转录
          </p>
        </div>
      </div>
    </div>

    <!-- 滚动到底部按钮 -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 scale-90"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-90"
    >
      <button
        v-if="showScrollButton"
        class="absolute bottom-6 right-6 size-10 rounded-full flex items-center justify-center transition-colors"
        style="background-color: var(--la-bg-surface); color: var(--la-accent)"
        @click="() => scrollToBottom()"
      >
        <MaterialIcon name="keyboard_arrow_down" size="md" />
      </button>
    </Transition>
  </div>
</template>
