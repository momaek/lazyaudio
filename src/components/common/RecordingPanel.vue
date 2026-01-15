<script setup lang="ts">
import { computed, ref, onUnmounted, watch } from 'vue'
import { useSessionStore } from '@/stores/session'
import MaterialIcon from './MaterialIcon.vue'

const sessionStore = useSessionStore()

// 实时更新的时长
const displayDuration = ref('00:00:00')
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

// 操作方法
async function handlePause() {
  const session = recordingState.value.session
  if (session) {
    await sessionStore.pauseSession(session.id)
  }
}

async function handleResume() {
  const session = recordingState.value.session
  if (session) {
    await sessionStore.resumeSession(session.id)
  }
}

async function handleStop() {
  const session = recordingState.value.session
  if (session) {
    await sessionStore.stopSession(session.id)
  }
}
</script>

<template>
  <div
    v-if="recordingState.isActive"
    class="flex items-center gap-4 px-5 py-2 rounded-2xl border transition-all"
    :class="[
      'bg-gray-50 border-border-light',
      'dark:bg-surface-dark/40 dark:border-border-dark'
    ]"
  >
    <!-- 录制胶囊 -->
    <div class="flex items-center gap-3 pr-4 border-r border-border-light dark:border-border-dark">
      <div 
        class="flex items-center gap-2 px-2.5 py-1 rounded-full border"
        :class="[
          recordingState.isRecording
            ? 'bg-red-50 border-red-200 dark:bg-red-500/10 dark:border-red-500/20'
            : 'bg-yellow-50 border-yellow-200 dark:bg-yellow-500/10 dark:border-yellow-500/20'
        ]"
      >
        <span 
          v-if="recordingState.isRecording"
          class="flex h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse"
        />
        <span 
          v-else
          class="flex h-1.5 w-1.5 rounded-full bg-yellow-500"
        />
        <span 
          class="text-[11px] font-mono font-bold"
          :class="[
            recordingState.isRecording 
              ? 'text-red-600 dark:text-red-500' 
              : 'text-yellow-600 dark:text-yellow-500'
          ]"
        >
          {{ displayDuration }}
        </span>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="flex items-center gap-1.5">
      <!-- 暂停/继续按钮 -->
      <button
        v-if="recordingState.isRecording"
        class="size-8 rounded-lg flex items-center justify-center text-text-muted hover:text-text-main hover:bg-gray-100 dark:text-text-muted-dark dark:hover:text-white dark:hover:bg-white/5 transition-colors"
        title="暂停"
        @click="handlePause"
      >
        <MaterialIcon name="pause" size="lg" />
      </button>
      <button
        v-else
        class="size-8 rounded-lg flex items-center justify-center text-text-muted hover:text-text-main hover:bg-gray-100 dark:text-text-muted-dark dark:hover:text-white dark:hover:bg-white/5 transition-colors"
        title="继续"
        @click="handleResume"
      >
        <MaterialIcon name="play_arrow" size="lg" />
      </button>

      <!-- 停止按钮 -->
      <button
        class="h-8 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white flex items-center gap-2 text-xs font-bold transition-all shadow-sm"
        title="停止"
        @click="handleStop"
      >
        <MaterialIcon name="stop_circle" size="sm" />
        Stop
      </button>
    </div>
  </div>
</template>
