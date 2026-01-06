<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import {
  Play,
  Pause,
  Square,
  Mic,
  Monitor,
  Volume2,
  Settings2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { AudioSource, AsrResult } from '@/types'

// 音频源列表
const audioSources = ref<AudioSource[]>([])
const microphones = ref<AudioSource[]>([])
const selectedSource = ref<string>('')
const selectedMicrophone = ref<string>('')

// 状态
const isCapturing = ref(false)
const isPaused = ref(false)
const isLoading = ref(false)
const error = ref<string | null>(null)

// 音频电平
const audioLevel = ref(0)
const micLevel = ref(0)

// 转录结果
const transcripts = ref<{ id: string; text: string; isFinal: boolean; timestamp: number }[]>([])
const currentPartial = ref('')

// 事件监听器
let unlisten: UnlistenFn[] = []

// 加载音频源
async function loadAudioSources() {
  try {
    isLoading.value = true
    error.value = null
    
    const sources = await invoke<AudioSource[]>('list_audio_sources')
    audioSources.value = sources.filter(s => s.source_type.type !== 'microphone')
    microphones.value = sources.filter(s => s.source_type.type === 'microphone')
    
    // 自动选择默认设备
    const defaultSource = audioSources.value.find(s => s.is_default)
    if (defaultSource) {
      selectedSource.value = defaultSource.id
    }
    
    const defaultMic = microphones.value.find(s => s.is_default)
    if (defaultMic) {
      selectedMicrophone.value = defaultMic.id
    }
  } catch (e) {
    error.value = `加载音频源失败: ${e}`
    console.error('加载音频源失败:', e)
  } finally {
    isLoading.value = false
  }
}

// 开始采集
async function startCapture() {
  try {
    isLoading.value = true
    error.value = null
    
    await invoke('start_audio_capture', {
      sourceId: selectedSource.value || null,
      microphoneId: selectedMicrophone.value || null,
    })
    
    isCapturing.value = true
    isPaused.value = false
  } catch (e) {
    error.value = `启动失败: ${e}`
    console.error('启动采集失败:', e)
  } finally {
    isLoading.value = false
  }
}

// 暂停采集
async function pauseCapture() {
  try {
    await invoke('pause_audio_capture')
    isPaused.value = true
  } catch (e) {
    error.value = `暂停失败: ${e}`
    console.error('暂停采集失败:', e)
  }
}

// 恢复采集
async function resumeCapture() {
  try {
    await invoke('resume_audio_capture')
    isPaused.value = false
  } catch (e) {
    error.value = `恢复失败: ${e}`
    console.error('恢复采集失败:', e)
  }
}

// 停止采集
async function stopCapture() {
  try {
    await invoke('stop_audio_capture')
    isCapturing.value = false
    isPaused.value = false
    audioLevel.value = 0
    micLevel.value = 0
  } catch (e) {
    error.value = `停止失败: ${e}`
    console.error('停止采集失败:', e)
  }
}

// 清空转录
function clearTranscripts() {
  transcripts.value = []
  currentPartial.value = ''
}

// 设置事件监听
async function setupListeners() {
  // 音频电平
  const unlistenLevel = await listen<{ level: number; source: string }>('audio:level', (event) => {
    if (event.payload.source === 'system') {
      audioLevel.value = event.payload.level * 100
    } else {
      micLevel.value = event.payload.level * 100
    }
  })
  unlisten.push(unlistenLevel)
  
  // 部分转录结果
  const unlistenPartial = await listen<AsrResult>('transcript:partial', (event) => {
    currentPartial.value = event.payload.text
  })
  unlisten.push(unlistenPartial)
  
  // 最终转录结果
  const unlistenFinal = await listen<AsrResult>('transcript:final', (event) => {
    transcripts.value.push({
      id: Date.now().toString(),
      text: event.payload.text,
      isFinal: true,
      timestamp: event.payload.timestamp,
    })
    currentPartial.value = ''
  })
  unlisten.push(unlistenFinal)
}

// 获取源类型图标
function getSourceIcon(source: AudioSource) {
  if (source.source_type.type === 'microphone') {
    return Mic
  }
  return Monitor
}

// 计算状态
const statusText = computed(() => {
  if (isLoading.value) return '处理中...'
  if (isPaused.value) return '已暂停'
  if (isCapturing.value) return '录制中'
  return '就绪'
})

const statusColor = computed(() => {
  if (isLoading.value) return 'text-la-info'
  if (isPaused.value) return 'text-la-warning'
  if (isCapturing.value) return 'text-la-recording'
  return 'text-la-success'
})

onMounted(async () => {
  await setupListeners()
  await loadAudioSources()
})

onUnmounted(() => {
  unlisten.forEach(fn => fn())
  if (isCapturing.value) {
    stopCapture()
  }
})
</script>

<template>
  <div class="container mx-auto px-4 py-6 max-w-4xl">
    <!-- 标题 -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">音频采集测试</h1>
        <p class="text-muted-foreground">测试音频采集和 ASR 功能</p>
      </div>
      <Badge variant="outline" :class="statusColor">
        {{ statusText }}
      </Badge>
    </div>

    <!-- 错误提示 -->
    <div
      v-if="error"
      class="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-3"
    >
      <AlertCircle class="h-5 w-5 text-destructive shrink-0 mt-0.5" />
      <div>
        <p class="font-medium text-destructive">出错了</p>
        <p class="text-sm text-muted-foreground">{{ error }}</p>
      </div>
    </div>

    <div class="grid gap-6 md:grid-cols-2">
      <!-- 音频源选择 -->
      <Card class="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle class="text-lg flex items-center gap-2">
            <Settings2 class="h-5 w-5 text-muted-foreground" />
            音频源配置
          </CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <!-- 系统音频 -->
          <div>
            <label class="text-sm font-medium mb-2 flex items-center gap-2">
              <Monitor class="h-4 w-4 text-muted-foreground" />
              系统音频
            </label>
            <Select v-model="selectedSource" :disabled="isCapturing">
              <SelectTrigger class="bg-card/50 border-border/50">
                <SelectValue placeholder="选择系统音频源" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="source in audioSources"
                  :key="source.id"
                  :value="source.id"
                >
                  <div class="flex items-center gap-2">
                    <component :is="getSourceIcon(source)" class="h-4 w-4 text-muted-foreground" />
                    {{ source.name }}
                    <CheckCircle2 v-if="source.is_default" class="h-3 w-3 text-la-success" />
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- 麦克风 -->
          <div>
            <label class="text-sm font-medium mb-2 flex items-center gap-2">
              <Mic class="h-4 w-4 text-muted-foreground" />
              麦克风
            </label>
            <Select v-model="selectedMicrophone" :disabled="isCapturing">
              <SelectTrigger class="bg-card/50 border-border/50">
                <SelectValue placeholder="选择麦克风" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="mic in microphones"
                  :key="mic.id"
                  :value="mic.id"
                >
                  <div class="flex items-center gap-2">
                    <Mic class="h-4 w-4 text-muted-foreground" />
                    {{ mic.name }}
                    <CheckCircle2 v-if="mic.is_default" class="h-3 w-3 text-la-success" />
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- 刷新按钮 -->
          <Button
            variant="outline"
            size="sm"
            class="w-full gap-2"
            :disabled="isCapturing || isLoading"
            @click="loadAudioSources"
          >
            <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': isLoading }" />
            刷新设备列表
          </Button>
        </CardContent>
      </Card>

      <!-- 控制面板 -->
      <Card class="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle class="text-lg flex items-center gap-2">
            <Volume2 class="h-5 w-5 text-muted-foreground" />
            控制面板
          </CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <!-- 电平指示 -->
          <div class="space-y-3">
            <div>
              <div class="flex items-center justify-between text-sm mb-1">
                <span class="flex items-center gap-2">
                  <Monitor class="h-3 w-3 text-muted-foreground" />
                  系统音频
                </span>
                <span class="text-muted-foreground tabular-nums">{{ Math.round(audioLevel) }}%</span>
              </div>
              <Progress :model-value="audioLevel" class="h-2" />
            </div>
            <div>
              <div class="flex items-center justify-between text-sm mb-1">
                <span class="flex items-center gap-2">
                  <Mic class="h-3 w-3 text-muted-foreground" />
                  麦克风
                </span>
                <span class="text-muted-foreground tabular-nums">{{ Math.round(micLevel) }}%</span>
              </div>
              <Progress :model-value="micLevel" class="h-2" />
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="flex gap-2">
            <Button
              v-if="!isCapturing"
              class="flex-1 gap-2"
              :disabled="isLoading"
              @click="startCapture"
            >
              <Play class="h-4 w-4" />
              开始
            </Button>
            <template v-else>
              <Button
                v-if="!isPaused"
                variant="secondary"
                class="flex-1 gap-2"
                @click="pauseCapture"
              >
                <Pause class="h-4 w-4" />
                暂停
              </Button>
              <Button
                v-else
                variant="secondary"
                class="flex-1 gap-2"
                @click="resumeCapture"
              >
                <Play class="h-4 w-4" />
                继续
              </Button>
              <Button
                variant="destructive"
                class="flex-1 gap-2"
                @click="stopCapture"
              >
                <Square class="h-4 w-4" />
                停止
              </Button>
            </template>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- 转录结果 -->
    <Card class="mt-6 bg-card/50 border-border/50">
      <CardHeader>
        <div class="flex items-center justify-between">
          <CardTitle class="text-lg">转录结果</CardTitle>
          <Button variant="ghost" size="sm" @click="clearTranscripts">
            清空
          </Button>
        </div>
        <CardDescription>
          实时显示语音识别结果
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea class="h-64 rounded-lg border border-border/50 bg-background/50">
          <div class="p-4 space-y-2">
            <template v-if="transcripts.length > 0 || currentPartial">
              <p
                v-for="item in transcripts"
                :key="item.id"
                class="text-sm"
              >
                {{ item.text }}
              </p>
              <p v-if="currentPartial" class="text-sm text-muted-foreground">
                {{ currentPartial }}
                <span class="inline-block w-0.5 h-4 bg-la-indigo animate-pulse ml-0.5" />
              </p>
            </template>
            <p v-else class="text-sm text-muted-foreground text-center py-8">
              开始采集后，转录结果将显示在这里
            </p>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  </div>
</template>
