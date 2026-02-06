<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import MeetingIdleView from './components/MeetingIdleView.vue'
import MeetingRecordingBar from './components/MeetingRecordingBar.vue'
import MeetingTranscriptArea from './components/MeetingTranscriptArea.vue'
import { useSession, useSessionHistory } from '@/composables/useSession'
import { useTranscript } from '@/composables/useTranscript'
import { useAudioLevelEvents } from '@/composables/useEvents'
import { BUILTIN_MODE_IDS } from '@/modes/types'
import { formatDurationFromSeconds } from '@/lib/formatters'

const router = useRouter()

// Composables
const {
  createSession,
  startSession,
  pauseSession,
  resumeSession,
  stopSession,
  isLoading: sessionLoading,
  error: sessionError,
} = useSession()

const sessionId = ref<string | null>(null)

const {
  segments,
  partialText,
  activeSegmentId,
  activeSegmentPartialText,
  isProcessing,
  recentlyRefinedIds,
  startListening: startTranscriptListening,
  reset: resetTranscript,
} = useTranscript(sessionId)

// 当前 Session ID (用于事件监听)
const currentSessionId = ref<string | null>(null)

// 音频电平监听
const {
  level: audioLevelValue,
  startListening: startAudioLevel,
  stopListening: stopAudioLevel,
} = useAudioLevelEvents(currentSessionId)

const { loadHistory } = useSessionHistory()

// 状态
const isRecording = ref(false)
const isPaused = ref(false)
const duration = ref(0)
const selectedAudioSource = ref('both')

// 计时器
let durationInterval: ReturnType<typeof setInterval> | null = null

// 音频源选项映射
const audioSourceLabels: Record<string, string> = {
  system: '系统音频',
  microphone: '麦克风',
  both: '系统音频+麦克风',
}

// 计算属性
const formattedDuration = computed(() => formatDurationFromSeconds(duration.value))
const audioLevel = computed(() => audioLevelValue.value * 100)
const audioSourceLabel = computed(() => audioSourceLabels[selectedAudioSource.value] ?? '')

// 开始录制
async function handleStart(audioSource: string, mergeForAsr: boolean) {
  selectedAudioSource.value = audioSource
  const useMic = audioSource === 'microphone' || audioSource === 'both'
  const useSystem = audioSource === 'system' || audioSource === 'both'

  const newSessionId = await createSession({
    modeId: BUILTIN_MODE_IDS.MEETING,
    name: `会议 ${new Date().toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
    config: {
      useMicrophone: useMic,
      useSystemAudio: useSystem,
      mergeForAsr,
      enableRecording: true,
      microphonePriority: 50,
    },
  })

  if (!newSessionId) {
    console.error('[MeetingMode] 创建 Session 失败:', sessionError.value)
    return
  }

  sessionId.value = newSessionId
  currentSessionId.value = newSessionId

  const started = await startSession(newSessionId)
  if (!started) {
    console.error('[MeetingMode] 启动 Session 失败:', sessionError.value)
    return
  }

  await startTranscriptListening()
  await startAudioLevel()

  isRecording.value = true
  isPaused.value = false
  duration.value = 0

  durationInterval = setInterval(() => {
    if (!isPaused.value) {
      duration.value++
    }
  }, 1000)
}

async function handlePause() {
  if (!sessionId.value) return
  const paused = await pauseSession(sessionId.value)
  if (paused) isPaused.value = true
}

async function handleResume() {
  if (!sessionId.value) return
  const resumed = await resumeSession(sessionId.value)
  if (resumed) isPaused.value = false
}

async function handleStop() {
  if (!sessionId.value) return
  const stopped = await stopSession(sessionId.value)
  if (stopped) {
    if (durationInterval) {
      clearInterval(durationInterval)
      durationInterval = null
    }
    stopAudioLevel()
    isRecording.value = false
    isPaused.value = false

    router.push(`/history/${sessionId.value}`)

    sessionId.value = null
    currentSessionId.value = null
    duration.value = 0
    resetTranscript()
    await loadHistory(true)
  }
}

function handleMarker() {
  // TODO: 实现书签功能
  console.log('[MeetingMode] 添加标记 at', duration.value)
}

function handleRename() {
  // TODO: 实现重命名对话框
  console.log('[MeetingMode] 重命名')
}

// 清理
onUnmounted(() => {
  if (durationInterval) {
    clearInterval(durationInterval)
  }
  stopAudioLevel()
})
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- 未录制状态 -->
    <MeetingIdleView
      v-if="!isRecording"
      :is-loading="sessionLoading"
      :error="sessionError"
      @start="handleStart"
    />

    <!-- 录制中状态 -->
    <template v-else>
      <MeetingRecordingBar
        :is-paused="isPaused"
        :is-loading="sessionLoading"
        :audio-level="audioLevel"
        :formatted-duration="formattedDuration"
        :audio-source-label="audioSourceLabel"
        @pause="handlePause"
        @resume="handleResume"
        @stop="handleStop"
        @marker="handleMarker"
        @rename="handleRename"
      />

      <MeetingTranscriptArea
        :segments="segments"
        :partial-text="partialText"
        :active-segment-id="activeSegmentId"
        :active-segment-partial-text="activeSegmentPartialText"
        :is-processing="isProcessing"
        :recently-refined-ids="recentlyRefinedIds"
        :is-paused="isPaused"
      />
    </template>
  </div>
</template>
