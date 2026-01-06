<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import {
  Mic,
  Play,
  Pause,
  Square,
  Flag,
  Edit2,
  Volume2,
  Monitor,
  Clock,
  FileText,
  ArrowDown,
  Loader2,
  RefreshCw,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSession, useSessionHistory } from '@/composables/useSession'
import { useTranscript } from '@/composables/useTranscript'
import { useAudioSources } from '@/composables/useAudio'
import { useAudioLevelEvents } from '@/composables/useEvents'
import { BUILTIN_MODE_IDS } from '@/modes/types'

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
  isProcessing,
  recentlyRefinedIds,
  startListening: startTranscriptListening,
  reset: resetTranscript,
} = useTranscript(sessionId)

const {
  refreshSources,
  forceRefreshSystemSources,
  isLoading: sourcesLoading,
} = useAudioSources()

// 当前 Session ID (用于事件监听)
const currentSessionId = ref<string | null>(null)

// 音频电平监听
const {
  level: audioLevelValue,
  startListening: startAudioLevel,
  stopListening: stopAudioLevel,
} = useAudioLevelEvents(currentSessionId)

const {
  sessions: recentSessions,
  isLoading: historyLoading,
  loadHistory,
} = useSessionHistory()

// 状态
const isRecording = ref(false)
const isPaused = ref(false)
const duration = ref(0)
const autoScroll = ref(true)
const isUserScrolling = ref(false)
const showScrollButton = ref(false)

// 音频源选择
const selectedAudioSource = ref('both')
const audioSourceOptions = [
  { value: 'system', label: '系统音频', icon: Monitor },
  { value: 'microphone', label: '麦克风', icon: Mic },
  { value: 'both', label: '系统音频+麦克风', icon: Volume2 },
]

// Refs
const scrollAreaRef = ref<InstanceType<typeof ScrollArea> | null>(null)
let durationInterval: ReturnType<typeof setInterval> | null = null

// 计算属性
const formattedDuration = computed(() => {
  const hours = Math.floor(duration.value / 3600)
  const minutes = Math.floor((duration.value % 3600) / 60)
  const seconds = duration.value % 60

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
})

const audioLevel = computed(() => {
  // 音频电平 (0-100)
  return audioLevelValue.value * 100
})

const recentMeetings = computed(() => {
  // 只取最近5条会议模式的记录
  return recentSessions.value
    .filter(s => s.modeId === BUILTIN_MODE_IDS.MEETING)
    .slice(0, 5)
    .map(s => ({
      id: s.id,
      title: s.name || '未命名会议',
      time: formatRelativeTime(s.createdAt),
      duration: formatDurationFromMs(s.durationMs),
    }))
})

// 格式化相对时间
function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return `今天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
  } else if (diffDays === 1) {
    return `昨天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
  } else if (diffDays < 7) {
    return `${diffDays}天前`
  } else {
    return `${date.getMonth() + 1}月${date.getDate()}日`
  }
}

// 格式化时长
function formatDurationFromMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

// 格式化时间戳
function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}


// 开始录制
async function startRecording() {
  // 创建 Session
  const useMic = selectedAudioSource.value === 'microphone' || selectedAudioSource.value === 'both'
  const useSystem = selectedAudioSource.value === 'system' || selectedAudioSource.value === 'both'

  const newSessionId = await createSession({
    modeId: BUILTIN_MODE_IDS.MEETING,
    name: `会议 ${new Date().toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
    config: {
      useMicrophone: useMic,
      useSystemAudio: useSystem,
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

  // 开始 Session
  const started = await startSession(newSessionId)
  if (!started) {
    console.error('[MeetingMode] 启动 Session 失败:', sessionError.value)
    return
  }

  // 开始监听转录
  await startTranscriptListening()

  // 开始监听音量（需要在 session 开始后监听）
  await startAudioLevel()

  // 更新状态
  isRecording.value = true
  isPaused.value = false
  duration.value = 0

  // 启动计时器
  durationInterval = setInterval(() => {
    if (!isPaused.value) {
      duration.value++
    }
  }, 1000)
}

// 暂停录制
async function pauseRecording() {
  if (!sessionId.value) return

  const paused = await pauseSession(sessionId.value)
  if (paused) {
    isPaused.value = true
  }
}

// 恢复录制
async function resumeRecording() {
  if (!sessionId.value) return

  const resumed = await resumeSession(sessionId.value)
  if (resumed) {
    isPaused.value = false
  }
}

// 停止录制
async function stopRecording() {
  if (!sessionId.value) return

  const stopped = await stopSession(sessionId.value)
  if (stopped) {
    // 停止计时器
    if (durationInterval) {
      clearInterval(durationInterval)
      durationInterval = null
    }

    // 停止音量监听
    stopAudioLevel()

    // 重置状态
    isRecording.value = false
    isPaused.value = false

    // 导航到历史记录查看
    router.push(`/history/${sessionId.value}`)

    // 重置
    sessionId.value = null
    currentSessionId.value = null
    duration.value = 0
    resetTranscript()

    // 刷新历史记录
    await loadHistory(true)
  }
}

// 添加标记
function addMarker() {
  // TODO: 实现书签功能
  console.log('[MeetingMode] 添加标记 at', duration.value)
}

// 重命名会议
function renameSession() {
  // TODO: 实现重命名对话框
  console.log('[MeetingMode] 重命名')
}

// 查看会议
function viewMeeting(id: string) {
  router.push(`/history/${id}`)
}

// 滚动到底部
function scrollToBottom() {
  nextTick(() => {
    const scrollArea = scrollAreaRef.value
    if (scrollArea) {
      const viewport = scrollArea.$el?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement
      if (viewport) {
        viewport.scrollTo({
          top: viewport.scrollHeight,
          behavior: 'smooth',
        })
      }
    }
  })
}

// 处理滚动
function handleScroll(event: Event) {
  const el = event.target as HTMLElement
  const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50
  showScrollButton.value = !isAtBottom
  
  if (isAtBottom) {
    autoScroll.value = true
    isUserScrolling.value = false
  } else {
    isUserScrolling.value = true
  }
}

// 监听转录变化，自动滚动
watch([segments, partialText], () => {
  if (autoScroll.value && !isUserScrolling.value) {
    scrollToBottom()
  }
})

// 初始化
onMounted(async () => {
  await refreshSources()
  await loadHistory(true)
})

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
    <template v-if="!isRecording">
      <div class="flex-1 flex flex-col items-center justify-center p-8">
        <!-- 图标 -->
        <div class="w-24 h-24 rounded-2xl la-gradient flex items-center justify-center mb-6 shadow-lg shadow-la-indigo/20">
          <Mic class="w-12 h-12 text-white" />
        </div>

        <h2 class="text-xl font-semibold mb-2">准备开始会议转录</h2>
        <p class="text-muted-foreground mb-8">选择音频源后开始录制</p>

        <!-- 音频源选择 -->
        <div class="w-full max-w-xs mb-6 flex items-center gap-2">
          <Select v-model="selectedAudioSource" class="flex-1">
            <SelectTrigger class="bg-card/50 border-border/50">
              <SelectValue placeholder="选择音频源" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="option in audioSourceOptions"
                :key="option.value"
                :value="option.value"
              >
                <div class="flex items-center gap-2">
                  <component :is="option.icon" class="h-4 w-4 text-muted-foreground" />
                  {{ option.label }}
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            :disabled="sourcesLoading"
            @click="forceRefreshSystemSources"
            title="刷新音频源列表"
          >
            <RefreshCw
              class="h-4 w-4"
              :class="{ 'animate-spin': sourcesLoading }"
            />
          </Button>
        </div>

        <!-- 开始按钮 -->
        <Button
          size="lg"
          class="gap-2 px-8"
          :disabled="sessionLoading || sourcesLoading"
          @click="startRecording"
        >
          <Loader2 v-if="sessionLoading" class="h-5 w-5 animate-spin" />
          <Play v-else class="h-5 w-5" />
          {{ sessionLoading ? '准备中...' : '开始录制' }}
        </Button>

        <!-- 错误提示 -->
        <p v-if="sessionError" class="text-destructive text-sm mt-4">
          {{ sessionError }}
        </p>

        <!-- 最近会议 -->
        <div v-if="recentMeetings.length > 0" class="w-full max-w-md mt-12">
          <h3 class="text-sm font-medium text-muted-foreground mb-4">最近会议</h3>
          <div class="space-y-2">
            <Card
              v-for="meeting in recentMeetings"
              :key="meeting.id"
              class="cursor-pointer bg-card/50 border-border/50 hover:bg-card/80 transition-colors"
              @click="viewMeeting(meeting.id)"
            >
              <CardContent class="p-3 flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <FileText class="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p class="text-sm font-medium">{{ meeting.title }}</p>
                    <p class="text-xs text-muted-foreground">{{ meeting.time }}</p>
                  </div>
                </div>
                <span class="text-xs text-muted-foreground tabular-nums">{{ meeting.duration }}</span>
              </CardContent>
            </Card>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-else-if="!historyLoading" class="w-full max-w-md mt-12 text-center">
          <p class="text-sm text-muted-foreground">还没有会议记录，开始你的第一次会议吧！</p>
        </div>
      </div>
    </template>

    <!-- 录制中状态 -->
    <template v-else>
      <!-- 控制栏 -->
      <div class="border-b border-border/50 px-4 py-3 flex items-center justify-between shrink-0 bg-card/50">
        <div class="flex items-center gap-4">
          <!-- 录制状态 -->
          <div class="flex items-center gap-2">
            <span
              v-if="!isPaused"
              class="relative flex h-3 w-3"
            >
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-la-recording opacity-75" />
              <span class="relative inline-flex rounded-full h-3 w-3 bg-la-recording" />
            </span>
            <Pause v-else class="h-3 w-3 text-la-warning" />
            <span class="text-sm font-medium">
              {{ isPaused ? '已暂停' : '录制中' }}
            </span>
          </div>

          <!-- 音频源 -->
          <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Volume2 class="h-3 w-3" />
            <span>{{ audioSourceOptions.find(o => o.value === selectedAudioSource)?.label }}</span>
          </div>

          <!-- 音量电平 -->
          <div class="w-24">
            <Progress :model-value="audioLevel" class="h-1.5" />
          </div>

          <!-- 时长 -->
          <div class="flex items-center gap-1.5 text-sm tabular-nums">
            <Clock class="h-3 w-3 text-muted-foreground" />
            {{ formattedDuration }}
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="flex items-center gap-2">
          <Button
            v-if="!isPaused"
            variant="secondary"
            size="sm"
            class="gap-1"
            :disabled="sessionLoading"
            @click="pauseRecording"
          >
            <Pause class="h-4 w-4" />
            暂停
          </Button>
          <Button
            v-else
            variant="secondary"
            size="sm"
            class="gap-1"
            :disabled="sessionLoading"
            @click="resumeRecording"
          >
            <Play class="h-4 w-4" />
            继续
          </Button>
          <Button
            variant="secondary"
            size="sm"
            class="gap-1"
            @click="addMarker"
          >
            <Flag class="h-4 w-4" />
            标记
          </Button>
          <Button
            variant="secondary"
            size="sm"
            class="gap-1"
            @click="renameSession"
          >
            <Edit2 class="h-4 w-4" />
          </Button>
          <Button
            variant="destructive"
            size="sm"
            class="gap-1"
            :disabled="sessionLoading"
            @click="stopRecording"
          >
            <Square class="h-4 w-4" />
            结束
          </Button>
        </div>
      </div>

      <!-- 转录区 -->
      <ScrollArea
        ref="scrollAreaRef"
        class="flex-1 relative"
        @scroll.native="handleScroll"
      >
        <div class="p-4 space-y-4">
          <!-- 已完成的转录 -->
          <div
            v-for="segment in segments"
            :key="segment.id"
            class="flex gap-4 group"
            :class="{ 
              'segment-updating': segment.tier === 'tier1',
              'segment-just-refined': recentlyRefinedIds.has(segment.id)
            }"
          >
            <span class="text-xs tabular-nums shrink-0 pt-0.5 cursor-pointer hover:text-foreground transition-colors"
              :class="segment.tier === 'tier1' ? 'text-muted-foreground/50' : 'text-muted-foreground'"
            >
              {{ formatTimestamp(segment.startTime) }}
            </span>
            <p 
              class="text-sm leading-relaxed transition-all duration-300"
              :class="segment.tier === 'tier1' ? 'text-muted-foreground/70 italic' : 'text-foreground'"
            >
              {{ segment.text }}
              <span 
                v-if="segment.tier === 'tier1'" 
                class="inline-block w-1 h-1 rounded-full bg-muted-foreground/50 ml-1 animate-pulse"
                title="等待精修（约3秒）..."
              />
            </p>
          </div>

          <!-- 实时输入指示 -->
          <div v-if="!isPaused" class="flex gap-4">
            <span class="text-xs text-muted-foreground tabular-nums shrink-0 pt-0.5">
              {{ formattedDuration }}
            </span>
            <p class="text-sm leading-relaxed text-muted-foreground">
              <span v-if="partialText">{{ partialText }}</span>
              <span class="inline-block w-0.5 h-4 bg-la-indigo animate-pulse ml-0.5" />
            </p>
          </div>

          <!-- 空状态 -->
          <div v-if="segments.length === 0 && !partialText && !isPaused" class="flex flex-col items-center justify-center py-12 text-center">
            <div class="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-4">
              <Mic class="h-6 w-6 text-muted-foreground" />
            </div>
            <p class="text-sm text-muted-foreground">正在聆听...</p>
            <p class="text-xs text-muted-foreground mt-1">开始说话后会自动转录</p>
          </div>
        </div>

        <!-- 滚动到底部按钮 -->
        <Transition name="fade">
          <Button
            v-if="showScrollButton"
            variant="secondary"
            size="icon"
            class="absolute bottom-4 right-4 rounded-full shadow-lg"
            @click="scrollToBottom"
          >
            <ArrowDown class="h-4 w-4" />
          </Button>
        </Transition>
      </ScrollArea>

      <!-- 底部提示 -->
      <div class="border-t border-border/50 px-4 py-2 flex items-center justify-between text-xs text-muted-foreground bg-card/30">
        <div class="flex items-center gap-2">
          <span v-if="isProcessing" class="flex items-center gap-1">
            <Loader2 class="h-3 w-3 animate-spin" />
            识别中...
          </span>
          <span v-else>
            {{ segments.length }} 段转录
          </span>
        </div>
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            v-model="autoScroll"
            type="checkbox"
            class="rounded border-border"
          />
          自动滚动
        </label>
      </div>
    </template>
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

/* Tier 1 临时状态样式（等待精修） */
.segment-updating {
  opacity: 0.85;
}

/* Tier 2 精修完成的闪烁动画效果 */
@keyframes refine-flash {
  0% {
    background-color: rgba(34, 197, 94, 0.15);
  }
  100% {
    background-color: transparent;
  }
}

.segment-just-refined {
  animation: refine-flash 0.5s ease-out;
  border-radius: 4px;
}

/* 精修完成时文字颜色过渡 */
.segment-just-refined p {
  color: var(--foreground) !important;
  font-style: normal !important;
}
</style>
