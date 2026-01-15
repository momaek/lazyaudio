<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useAutoScroll } from '@/composables/useAutoScroll'
import MaterialIcon from '@/components/common/MaterialIcon.vue'
import type { TranscriptSegment } from '@/types'

const props = defineProps<{
  segments: TranscriptSegment[]
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
function formatTimestamp(timestamp: number): string {
  const totalSeconds = Math.floor(timestamp / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

// 生成说话人头像
function getSpeakerInitials(speaker: string): string {
  if (!speaker) return 'U'
  const parts = speaker.split(' ')
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }
  return speaker.substring(0, 2).toUpperCase()
}

// 说话人颜色（基于哈希）
function getSpeakerColor(speaker: string): string {
  const colors = [
    'bg-blue-100 dark:bg-blue-500/20 border-blue-200 dark:border-blue-500/30 text-blue-600 dark:text-blue-400',
    'bg-emerald-100 dark:bg-emerald-500/20 border-emerald-200 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400',
    'bg-purple-100 dark:bg-purple-500/20 border-purple-200 dark:border-purple-500/30 text-purple-600 dark:text-purple-400',
    'bg-amber-100 dark:bg-amber-500/20 border-amber-200 dark:border-amber-500/30 text-amber-600 dark:text-amber-400',
  ]
  let hash = 0
  for (let i = 0; i < speaker.length; i++) {
    hash = speaker.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

// 监听转录变化，自动滚动
watch(() => [props.segments, props.partialText], () => {
  nextTick(() => {
    const container = scrollContainerRef.value
    if (container && !props.isPaused) {
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100
      if (isNearBottom) {
        scrollToBottom()
      }
    }
  })
}, { deep: true })
</script>

<template>
  <div class="flex-1 flex flex-col bg-background-light dark:bg-background-dark overflow-hidden">
    <!-- 转录内容滚动区 -->
    <div 
      ref="scrollContainerRef"
      class="flex-1 overflow-y-auto p-8 custom-scrollbar"
      @scroll="handleScroll"
    >
      <div class="max-w-4xl mx-auto space-y-8 pb-12">
        <!-- 转录段落 -->
        <div
          v-for="segment in segments"
          :key="segment.clientId"
          class="flex gap-6 group"
        >
          <!-- 时间戳列 -->
          <div class="w-16 pt-1 shrink-0 text-right">
            <span 
              class="text-xs font-mono opacity-60"
              :class="[
                segment.clientId === activeSegmentId 
                  ? 'text-brand-primary dark:text-primary-bright font-bold opacity-100' 
                  : 'text-text-muted dark:text-text-muted-dark'
              ]"
            >
              {{ formatTimestamp(segment.startTime) }}
            </span>
          </div>

          <!-- 内容列 -->
          <div class="flex-1">
            <!-- 说话人 -->
            <div class="flex items-center gap-2 mb-2">
              <div 
                class="size-6 rounded-full border flex items-center justify-center"
                :class="getSpeakerColor(segment.speaker || 'User')"
              >
                <span class="text-[10px] font-bold">
                  {{ getSpeakerInitials(segment.speaker || 'User') }}
                </span>
              </div>
              <span class="text-sm font-bold text-text-main dark:text-white font-display">
                {{ segment.speaker || 'User' }}
              </span>
            </div>

            <!-- 气泡 -->
            <div 
              class="p-4 rounded-xl rounded-tl-none leading-relaxed shadow-sm transition-colors"
              :class="[
                segment.clientId === activeSegmentId
                  ? 'bg-brand-primary/5 dark:bg-primary-bright/5 border border-brand-primary/20 dark:border-primary-bright/30 dark:shadow-lg dark:shadow-brand-primary/5'
                  : 'bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark text-gray-700 dark:text-text-muted-dark group-hover:border-brand-primary/40 dark:group-hover:border-primary-bright/30'
              ]"
            >
              {{ segment.text }}
              
              <!-- 活跃段落的临时文本 -->
              <span 
                v-if="segment.clientId === activeSegmentId && activeSegmentPartialText" 
                class="text-brand-primary dark:text-primary-bright opacity-80"
              >
                {{ ' ' + activeSegmentPartialText }}
              </span>

              <!-- 脉动光标 -->
              <span 
                v-if="segment.clientId === activeSegmentId && !isPaused"
                class="inline-block w-1.5 h-4 bg-brand-primary dark:bg-primary-bright ml-1 animate-pulse align-middle"
              />
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div 
          v-if="segments.length === 0 && !activeSegmentId && !isPaused" 
          class="flex flex-col items-center justify-center py-24 text-center"
        >
          <div class="w-16 h-16 rounded-full bg-muted/30 dark:bg-white/5 flex items-center justify-center mb-4">
            <MaterialIcon name="mic" size="xl" class="text-text-muted dark:text-text-muted-dark" />
          </div>
          <p class="text-sm text-text-muted dark:text-text-muted-dark font-medium">正在聆听...</p>
          <p class="text-xs text-text-muted dark:text-text-muted-dark mt-1 opacity-60">开始说话后会自动转录</p>
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
        class="absolute bottom-8 right-8 size-12 rounded-full bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark shadow-xl hover:shadow-2xl flex items-center justify-center transition-all hover:scale-110"
        @click="scrollToBottom"
      >
        <MaterialIcon name="arrow_downward" class="text-brand-primary dark:text-primary-bright" />
      </button>
    </Transition>
  </div>
</template>
