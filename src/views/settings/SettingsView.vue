<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { invoke } from '@tauri-apps/api/core'
import { type UnlistenFn } from '@tauri-apps/api/event'
import { events } from '@/types/bindings'
import { useAppStore } from '@/stores/app'
import {
  ArrowLeft,
  Palette,
  Globe,
  Mic,
  Bot,
  Keyboard,
  HardDrive,
  Shield,
  Wrench,
  Play,
  Square,
  Monitor,
  RefreshCw,
  AlertCircle,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
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

const router = useRouter()
const appStore = useAppStore()

// 当前选中的设置分类
const activeTab = ref('appearance')

// 设置分类
const settingCategories = [
  { id: 'appearance', name: '外观', icon: Palette },
  { id: 'audio', name: '音频', icon: Mic },
  { id: 'ai', name: 'AI', icon: Bot },
  { id: 'shortcuts', name: '快捷键', icon: Keyboard },
  { id: 'storage', name: '存储', icon: HardDrive },
  { id: 'permissions', name: '权限', icon: Shield },
  { id: 'language', name: '语言', icon: Globe },
  { id: 'developer', name: '开发者', icon: Wrench },
]

// 主题选项
const themeOptions = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
]

// ========== 音频测试相关 ==========
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
    // 参数: mic_id, system_source_id, enable_recording
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
    // micLevel 和 systemLevel 是 0-1 的值，转换为百分比
    const newMicLevel = event.payload.micLevel * 100
    const newAudioLevel = event.payload.systemLevel * 100
    
    micLevel.value = newMicLevel
    audioLevel.value = newAudioLevel
    
    // 仅在值有变化时输出日志
    if (newAudioLevel > 1 || newMicLevel > 1) {
      console.log(`电平更新: mic=${newMicLevel.toFixed(1)}%, system=${newAudioLevel.toFixed(1)}%`)
    }
  })
  unlisten.push(unlistenLevel)
}

// 返回
function goBack() {
  router.back()
}

onMounted(async () => {
  await setupListeners()
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
    <!-- 标题栏 -->
    <div class="flex items-center gap-4 mb-6">
      <Button variant="ghost" size="icon" class="text-muted-foreground" @click="goBack">
        <ArrowLeft class="h-5 w-5" />
      </Button>
      <h1 class="text-2xl font-bold">设置</h1>
    </div>

    <!-- 设置内容 -->
    <div class="flex gap-6">
      <!-- 左侧分类列表 -->
      <div class="w-44 shrink-0 space-y-1">
        <button
          v-for="category in settingCategories"
          :key="category.id"
          class="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors"
          :class="[
            activeTab === category.id
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
          ]"
          @click="activeTab = category.id"
        >
          <component :is="category.icon" class="h-4 w-4 shrink-0" />
          <span>{{ category.name }}</span>
        </button>
      </div>

      <!-- 右侧设置内容 -->
      <div class="flex-1 min-w-0">
        <!-- 外观设置 -->
        <div v-show="activeTab === 'appearance'" class="space-y-6">
          <div>
            <h2 class="text-lg font-semibold mb-4">外观设置</h2>
            <Separator class="mb-6" />
          </div>

          <!-- 主题 -->
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-medium">主题</h3>
              <p class="text-sm text-muted-foreground">选择应用的颜色主题</p>
            </div>
            <Select
              :model-value="appStore.currentTheme"
              @update:model-value="(v: any) => appStore.setTheme(v)"
            >
              <SelectTrigger class="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="option in themeOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <!-- 音频设置 -->
        <div v-show="activeTab === 'audio'" class="space-y-6">
          <div>
            <h2 class="text-lg font-semibold mb-4">音频设置</h2>
            <Separator class="mb-6" />
          </div>
          <p class="text-muted-foreground">音频设置功能开发中...</p>
        </div>

        <!-- AI 设置 -->
        <div v-show="activeTab === 'ai'" class="space-y-6">
          <div>
            <h2 class="text-lg font-semibold mb-4">AI 设置</h2>
            <Separator class="mb-6" />
          </div>
          <p class="text-muted-foreground">AI 设置功能开发中...</p>
        </div>

        <!-- 快捷键设置 -->
        <div v-show="activeTab === 'shortcuts'" class="space-y-6">
          <div>
            <h2 class="text-lg font-semibold mb-4">快捷键设置</h2>
            <Separator class="mb-6" />
          </div>
          <p class="text-muted-foreground">快捷键设置功能开发中...</p>
        </div>

        <!-- 存储设置 -->
        <div v-show="activeTab === 'storage'" class="space-y-6">
          <div>
            <h2 class="text-lg font-semibold mb-4">存储设置</h2>
            <Separator class="mb-6" />
          </div>
          <p class="text-muted-foreground">存储设置功能开发中...</p>
        </div>

        <!-- 权限设置 -->
        <div v-show="activeTab === 'permissions'" class="space-y-6">
          <div>
            <h2 class="text-lg font-semibold mb-4">权限设置</h2>
            <Separator class="mb-6" />
          </div>
          <p class="text-muted-foreground">权限设置功能开发中...</p>
        </div>

        <!-- 语言设置 -->
        <div v-show="activeTab === 'language'" class="space-y-6">
          <div>
            <h2 class="text-lg font-semibold mb-4">语言设置</h2>
            <Separator class="mb-6" />
          </div>
          <p class="text-muted-foreground">语言设置功能开发中...</p>
        </div>

        <!-- 开发者工具 -->
        <div v-show="activeTab === 'developer'" class="space-y-6">
          <div>
            <h2 class="text-lg font-semibold mb-4">开发者工具</h2>
            <Separator class="mb-6" />
          </div>

          <!-- 错误提示 -->
          <div
            v-if="error"
            class="p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-3"
          >
            <AlertCircle class="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p class="font-medium text-destructive">出错了</p>
              <p class="text-sm text-muted-foreground">{{ error }}</p>
            </div>
          </div>

          <div class="grid gap-6 lg:grid-cols-2">
            <!-- 音频源选择 -->
            <Card class="bg-card/50 border-border/50">
              <CardHeader class="pb-4">
                <CardTitle class="text-base">音频源配置</CardTitle>
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
              <CardHeader class="pb-4">
                <div class="flex items-center justify-between">
                  <CardTitle class="text-base">控制面板</CardTitle>
                  <Badge
                    variant="outline"
                    :class="isCapturing ? 'text-la-recording' : 'text-la-success'"
                  >
                    {{ isCapturing ? '测试中' : '就绪' }}
                  </Badge>
                </div>
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
          <Card class="bg-card/50 border-border/50">
            <CardContent class="p-4">
              <p class="text-sm text-muted-foreground">
                💡 提示：选择音频源后点击"开始测试"，观察电平指示器变化来验证音频采集是否正常。
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  </div>
</template>
