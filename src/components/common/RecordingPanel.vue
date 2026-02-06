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

// 操作方法 — 使用 composable/commands 而非直接 store
async function handlePause() {
  const session = recordingState.value.session
  if (session) {
    // TODO: 使用 useSession composable 的 pauseSession
    console.warn('[RecordingPanel] pauseSession not directly on store; needs composable wiring')
  }
}

async function handleResume() {
  const session = recordingState.value.session
  if (session) {
    // TODO: 使用 useSession composable 的 resumeSession
    console.warn('[RecordingPanel] resumeSession not directly on store; needs composable wiring')
  }
}

async function handleStop() {
  const session = recordingState.value.session
  if (session) {
    // TODO: 使用 useSession composable 的 stopSession
    console.warn('[RecordingPanel] stopSession not directly on store; needs composable wiring')
  }
}
</script>

<template>
  <div
    v-if="recordingState.isActive"
    class="flex items-center gap-4 px-5 py-2 rounded-2xl border transition-all"
    style="background-color: var(--la-bg-surface); border-color: var(--la-border)"
  >
    <!-- 录制胶囊 -->
    <div
      class="flex items-center gap-3 pr-4 border-r"
      style="border-color: var(--la-border)"
    >
      <div
        class="flex items-center gap-2 px-2.5 py-1 rounded-full"
        :style="
          recordingState.isRecording
            ? { backgroundColor: 'var(--la-recording-red-dim)' }
            : { backgroundColor: 'var(--la-bg-inset)' }
        "
      >
        <span v-if="recordingState.isRecording" class="recording-dot" style="width: 6px; height: 6px" />
        <span
          v-else
          class="size-1.5 rounded-full"
          style="background-color: var(--la-text-tertiary)"
        />
        <span
          class="text-[11px] font-mono font-bold"
          :style="{
            color: recordingState.isRecording
              ? 'var(--la-recording-red)'
              : 'var(--la-text-tertiary)',
          }"
        >
          {{ displayDuration }}
        </span>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="flex items-center gap-1.5">
      <!-- 暂停/继续 -->
      <button
        v-if="recordingState.isRecording"
        class="size-8 rounded-lg flex items-center justify-center transition-colors"
        style="color: var(--la-text-secondary)"
        title="暂停"
        @click="handlePause"
      >
        <MaterialIcon name="pause" size="md" />
      </button>
      <button
        v-else
        class="size-8 rounded-lg flex items-center justify-center transition-colors"
        style="color: var(--la-text-secondary)"
        title="继续"
        @click="handleResume"
      >
        <MaterialIcon name="play_arrow" size="md" />
      </button>

      <!-- 停止按钮 -->
      <button
        class="h-8 px-4 rounded-lg flex items-center gap-2 text-xs font-bold transition-colors"
        style="background-color: var(--la-recording-red); color: white"
        title="停止"
        @click="handleStop"
      >
        <MaterialIcon name="stop_circle" size="sm" />
        Stop
      </button>
    </div>
  </div>
</template>
