<script setup lang="ts">
import { computed, ref, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { useModeStore } from '@/stores/mode'

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

  const pausedSession = sessionStore.activeSessions.find((s) => s.state === 'paused')
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
    class="flex items-center gap-2 px-3 py-1 rounded-full transition-colors"
    style="background-color: var(--la-recording-red-dim)"
    @click="goToRecordingMode"
  >
    <!-- 录制红点 / 暂停图标 -->
    <span
      v-if="recordingState.isRecording"
      class="recording-dot"
    />
    <span
      v-else
      class="material-symbols-rounded text-xs"
      style="color: var(--la-recording-red)"
    >
      pause
    </span>

    <!-- 时长 -->
    <span
      class="text-[13px] font-mono font-semibold tabular-nums"
      style="color: var(--la-recording-red)"
    >
      {{ displayDuration }}
    </span>

    <!-- 模式名称 -->
    <span
      class="text-xs"
      style="color: var(--la-text-secondary)"
    >
      {{ modeStore.currentPrimaryMode?.name || '' }}
    </span>
  </button>
</template>
