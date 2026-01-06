<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { type UnlistenFn } from '@tauri-apps/api/event'
import { events } from '@/types/bindings'
import {
  Play,
  Square,
  Mic,
  Monitor,
  Settings2,
  RefreshCw,
  AlertCircle,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { AudioSource } from '@/types'

// 音频源列表
const audioSources = ref<AudioSource[]>([])
const microphones = ref<AudioSource[]>([])
const selectedSource = ref<string>('')
const selectedMicrophone = ref<string>('')

// 状态
const isCapturing = ref(false)
const isLoading = ref(false)
const error = ref<string | null>(null)

// 音频电平
const audioLevel = ref(0)
const micLevel = ref(0)

// 事件监听器
let unlisten: UnlistenFn[] = []

// 加载音频源
async function loadAudioSources() {
  try {
    isLoading.value = true
    error.value = null
    
    // 获取系统音频源（包括应用音频）
    const systemSources = await invoke<AudioSource[]>('list_system_audio_sources')
    audioSources.value = systemSources
    
    // 获取麦克风列表
    const mics = await invoke<AudioSource[]>('list_microphones')
    microphones.value = mics
    
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
    
    // 使用 start_audio_test 命令
    await invoke('start_audio_test', {
      micId: selectedMicrophone.value || '',
      systemSourceId: selectedSource.value || null,
      enableRecording: true,
    })
    
    isCapturing.value = true
  } catch (e) {
    error.value = `启动失败: ${e}`
    console.error('启动采集失败:', e)
  } finally {
    isLoading.value = false
  }
}

// 停止采集
async function stopCapture() {
  try {
    await invoke('stop_audio_test')
    isCapturing.value = false
    audioLevel.value = 0
    micLevel.value = 0
  } catch (e) {
    error.value = `停止失败: ${e}`
    console.error('停止采集失败:', e)
  }
}

// 设置事件监听
async function setupListeners() {
  // 音频电平 - 使用 tauri-specta 生成的事件
  const unlistenLevel = await events.audioLevelEvent.listen((event) => {
    micLevel.value = event.payload.micLevel * 100
    audioLevel.value = event.payload.systemLevel * 100
  })
  unlisten.push(unlistenLevel)
}

// 计算状态
const statusText = computed(() => {
  if (isLoading.value) return '处理中...'
  if (isCapturing.value) return '测试中'
  return '就绪'
})

const statusColor = computed(() => {
  if (isLoading.value) return 'text-la-info'
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
                  {{ source.name }}
                  <span v-if="source.is_default" class="text-xs text-la-success ml-2">(默认)</span>
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
                  {{ mic.name }}
                  <span v-if="mic.is_default" class="text-xs text-la-success ml-2">(默认)</span>
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
            <Mic class="h-5 w-5 text-muted-foreground" />
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
              :disabled="isLoading || !selectedMicrophone"
              @click="startCapture"
            >
              <Play class="h-4 w-4" />
              开始测试
            </Button>
            <Button
              v-else
              variant="destructive"
              class="flex-1 gap-2"
              @click="stopCapture"
            >
              <Square class="h-4 w-4" />
              停止测试
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- 提示信息 -->
    <Card class="mt-6 bg-card/50 border-border/50">
      <CardContent class="p-4">
        <p class="text-sm text-muted-foreground">
          💡 提示：选择音频源后点击"开始测试"，观察电平指示器变化来验证音频采集是否正常。
        </p>
      </CardContent>
    </Card>
  </div>
</template>
