<script setup lang="ts">
import { computed, ref, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { useModeStore } from '@/stores/mode'
import { Pause } from 'lucide-vue-next'

const router = useRouter()
const sessionStore = useSessionStore()
const modeStore = useModeStore()

// 实时更新的时长
const displayDuration = ref('00:00')
let durationTimer: ReturnType<typeof setInterval> | null = null

// 计算录制状态
const recordingState = computed(() => {
  const session = sessionStore.recordingSession
  if (session) {
    return {
      isActive: true,
      isRecording: true,
      isPaused: false,
      session,
    }
  }

  const pausedSession = sessionStore.activeSessions.find(s => s.state === 'paused')
  if (pausedSession) {
    return {
      isActive: true,
      isRecording: false,
      isPaused: true,
      session: pausedSession,
    }
  }

  return {
    isActive: false,
    isRecording: false,
    isPaused: false,
    session: null,
  }
})

// 更新时长显示
function updateDuration() {
  const session = recordingState.value.session
  if (!session) return

  if (recordingState.value.isRecording) {
    const elapsed = Date.now() - session.startTime
    displayDuration.value = sessionStore.formatDuration(elapsed)
  } else {
    displayDuration.value = sessionStore.formatDuration(session.duration)
  }
}

// 启动/停止计时器
function startTimer() {
  stopTimer()
  updateDuration()
  durationTimer = setInterval(updateDuration, 1000)
}

function stopTimer() {
  if (durationTimer) {
    clearInterval(durationTimer)
    durationTimer = null
  }
}

watch(
  () => recordingState.value.isActive,
  (isActive) => {
    if (isActive) {
      startTimer()
    } else {
      stopTimer()
    }
  },
  { immediate: true }
)

onUnmounted(() => {
  stopTimer()
})

// 点击跳转到对应模式页面
function goToRecordingMode() {
  const session = recordingState.value.session
  if (session) {
    router.push(`/mode/${session.modeId}`)
  }
}
</script>

<template>
  <button
    v-if="recordingState.isActive"
    class="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200"
    :class="[
      recordingState.isRecording
        ? 'bg-la-recording/15 text-la-recording hover:bg-la-recording/25'
        : 'bg-la-warning/15 text-la-warning hover:bg-la-warning/25',
    ]"
    @click="goToRecordingMode"
  >
    <!-- 状态指示器 -->
    <span v-if="recordingState.isRecording" class="relative flex h-2 w-2">
      <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-la-recording opacity-75" />
      <span class="relative inline-flex rounded-full h-2 w-2 bg-la-recording" />
    </span>
    <Pause v-else class="h-3 w-3" />

    <!-- 时长 -->
    <span class="tabular-nums">{{ displayDuration }}</span>

    <!-- 模式名称 -->
    <span class="hidden sm:inline text-xs opacity-75">
      {{ modeStore.currentPrimaryMode?.name || '' }}
    </span>
  </button>
</template>
