<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { open as shellOpen } from '@tauri-apps/plugin-shell'
import { commands, events } from '@/types'
import type { AudioSource, AudioLevelEvent } from '@/types'

// 状态
const isCapturing = ref(false)
const audioSources = ref<AudioSource[]>([])
const microphones = ref<AudioSource[]>([])
const selectedSource = ref<string>('')
const selectedMic = ref<string>('')
const error = ref<string | null>(null)
const isLoading = ref(false)

// 音量电平（分开显示麦克风和系统音频）
const micLevel = ref(0)
const micPeak = ref(0)
const systemLevel = ref(0)
const systemPeak = ref(0)

// 录制相关
const enableRecording = ref(true)
const micRecordingPath = ref<string | null>(null)
const systemRecordingPath = ref<string | null>(null)

// 统计信息
const captureStats = ref({
  duration: 0,
  samplesProcessed: 0,
})

// 麦克风音量条样式
const micLevelStyle = computed(() => ({
  width: `${micLevel.value * 100}%`,
  transition: 'width 50ms ease-out',
}))

const micPeakStyle = computed(() => ({
  left: `${micPeak.value * 100}%`,
}))

// 系统音频音量条样式
const systemLevelStyle = computed(() => ({
  width: `${systemLevel.value * 100}%`,
  transition: 'width 50ms ease-out',
}))

const systemPeakStyle = computed(() => ({
  left: `${systemPeak.value * 100}%`,
}))

// 加载音频源列表
async function loadAudioSources() {
  isLoading.value = true
  error.value = null
  
  try {
    // 加载系统音频源
    const systemResult = await commands.listSystemAudioSources()
    if (systemResult.status === 'ok') {
      audioSources.value = systemResult.data
      // 默认选择"不采集系统音频"
      if (!selectedSource.value) {
        selectedSource.value = '__none__'
      }
    }
    
    // 加载麦克风列表
    const micResult = await commands.listMicrophones()
    if (micResult.status === 'ok') {
      microphones.value = micResult.data
      if (microphones.value.length > 0 && !selectedMic.value) {
        const defaultMic = microphones.value.find(m => m.isDefault)
        selectedMic.value = defaultMic?.id || microphones.value[0].id
      }
    }
  } catch (e) {
    error.value = `加载音频源失败: ${e}`
    console.error(e)
  } finally {
    isLoading.value = false
  }
}

// 开始采集
async function startCapture() {
  if (!selectedMic.value) {
    error.value = '请先选择麦克风'
    return
  }
  
  isCapturing.value = true
  error.value = null
  micRecordingPath.value = null
  systemRecordingPath.value = null
  captureStats.value = { duration: 0, samplesProcessed: 0 }
  
  try {
    // __none__ 表示不采集系统音频，转换为 null
    const systemSourceId = selectedSource.value === '__none__' ? null : selectedSource.value
    const result = await commands.startAudioTest(selectedMic.value, systemSourceId, enableRecording.value)
    if (result.status === 'error') {
      error.value = result.error
      isCapturing.value = false
    } else if (result.status === 'ok') {
      // 保存录制文件路径
      micRecordingPath.value = result.data.micRecordingPath ?? null
      systemRecordingPath.value = result.data.systemRecordingPath ?? null
    }
  } catch (e) {
    error.value = `启动采集失败: ${e}`
    isCapturing.value = false
    console.error(e)
  }
}

// 停止采集
async function stopCapture() {
  try {
    await commands.stopAudioTest()
  } catch (e) {
    console.error('停止采集失败:', e)
  } finally {
    isCapturing.value = false
    micLevel.value = 0
    micPeak.value = 0
    systemLevel.value = 0
    systemPeak.value = 0
  }
}

// 打开录制文件所在目录
async function openRecordingFolder() {
  const path = micRecordingPath.value || systemRecordingPath.value
  if (path) {
    try {
      // 获取目录路径
      const dirPath = path.substring(0, path.lastIndexOf('/'))
      await shellOpen(dirPath)
    } catch (e) {
      console.error('打开目录失败:', e)
      error.value = `打开目录失败: ${e}`
    }
  }
}

// 用系统播放器播放麦克风录制文件
async function playMicRecording() {
  if (micRecordingPath.value) {
    try {
      await shellOpen(micRecordingPath.value)
    } catch (e) {
      console.error('播放文件失败:', e)
      error.value = `播放文件失败: ${e}`
    }
  }
}

// 用系统播放器播放系统音频录制文件
async function playSystemRecording() {
  if (systemRecordingPath.value) {
    try {
      await shellOpen(systemRecordingPath.value)
    } catch (e) {
      console.error('播放文件失败:', e)
      error.value = `播放文件失败: ${e}`
    }
  }
}

// 音量电平更新监听器
let levelUnlisten: (() => void) | null = null

onMounted(async () => {
  await loadAudioSources()
  
  // 监听音量事件
  levelUnlisten = await events.audioLevelEvent.listen((event) => {
    // 麦克风电平
    micLevel.value = event.payload.micLevel
    micPeak.value = Math.max(micPeak.value * 0.995, event.payload.micPeak)
    // 系统音频电平
    systemLevel.value = event.payload.systemLevel
    systemPeak.value = Math.max(systemPeak.value * 0.995, event.payload.systemPeak)
    // 统计信息
    captureStats.value.samplesProcessed = event.payload.samples
    captureStats.value.duration = event.payload.durationMs
  })
})

onUnmounted(() => {
  if (levelUnlisten) {
    levelUnlisten()
  }
  if (isCapturing.value) {
    stopCapture()
  }
})

// 格式化时长
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8">
    <div class="max-w-4xl mx-auto space-y-6">
      <!-- 标题 -->
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-white mb-2 font-['DM_Sans',system-ui,sans-serif]">
          🎙️ 音频采集测试
        </h1>
        <p class="text-slate-400">
          测试 macOS 系统音频和麦克风采集功能
        </p>
      </div>

      <!-- 错误提示 -->
      <div v-if="error" class="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
        {{ error }}
      </div>

      <!-- 音频源选择 -->
      <Card class="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle class="text-white">音频源选择</CardTitle>
          <CardDescription class="text-slate-400">
            选择要采集的音频输入设备
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <!-- 麦克风选择 -->
          <div class="space-y-2">
            <label class="text-sm text-slate-300">麦克风</label>
            <Select v-model="selectedMic" :disabled="isCapturing">
              <SelectTrigger class="bg-slate-800 border-slate-700 text-white">
                <SelectValue placeholder="选择麦克风..." />
              </SelectTrigger>
              <SelectContent class="bg-slate-800 border-slate-700">
                <SelectItem 
                  v-for="mic in microphones" 
                  :key="mic.id" 
                  :value="mic.id"
                  class="text-white hover:bg-slate-700"
                >
                  <div class="flex items-center gap-2">
                    <span>🎤</span>
                    <span>{{ mic.name }}</span>
                    <Badge v-if="mic.isDefault" variant="outline" class="text-xs">默认</Badge>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- 系统音频选择 -->
          <div class="space-y-2">
            <label class="text-sm text-slate-300">系统音频（可选）</label>
            <Select v-model="selectedSource" :disabled="isCapturing">
              <SelectTrigger class="bg-slate-800 border-slate-700 text-white">
                <SelectValue placeholder="选择系统音频源..." />
              </SelectTrigger>
              <SelectContent class="bg-slate-800 border-slate-700">
                <SelectItem value="__none__" class="text-slate-400 hover:bg-slate-700">
                  不采集系统音频
                </SelectItem>
                <SelectItem 
                  v-for="source in audioSources" 
                  :key="source.id" 
                  :value="source.id"
                  class="text-white hover:bg-slate-700"
                >
                  <div class="flex items-center gap-2">
                    <span>🔊</span>
                    <span>{{ source.name }}</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- 录制开关 -->
          <div class="flex items-center justify-between pt-2 border-t border-slate-800">
            <div class="flex items-center gap-2">
              <span class="text-red-500">●</span>
              <label class="text-sm text-slate-300">录制到 WAV 文件</label>
            </div>
            <Switch 
              :checked="enableRecording"
              :disabled="isCapturing"
              @update:checked="enableRecording = $event"
            />
          </div>

          <!-- 刷新按钮 -->
          <Button 
            variant="outline" 
            size="sm"
            class="border-slate-700 text-slate-300 hover:bg-slate-800"
            :disabled="isLoading || isCapturing"
            @click="loadAudioSources"
          >
            <span :class="{ 'animate-spin': isLoading }">🔄</span>
            <span class="ml-2">刷新设备列表</span>
          </Button>
        </CardContent>
      </Card>

      <!-- 录制文件信息 -->
      <Card v-if="micRecordingPath || systemRecordingPath" class="bg-slate-900/50 border-slate-800">
        <CardHeader class="pb-2">
          <CardTitle class="text-white flex items-center gap-2 text-base">
            <span>🎵</span>
            录制文件
          </CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <!-- 麦克风录制 -->
          <div v-if="micRecordingPath" class="bg-slate-800 rounded-lg p-3">
            <div class="flex items-center gap-2 mb-2">
              <span>🎤</span>
              <span class="text-sm text-slate-300 font-medium">麦克风</span>
            </div>
            <p class="text-xs text-slate-200 font-mono break-all mb-2">{{ micRecordingPath }}</p>
            <Button 
              size="sm"
              class="bg-cyan-600 hover:bg-cyan-500"
              :disabled="isCapturing"
              @click="playMicRecording"
            >
              <span class="mr-1">▶️</span>
              播放
            </Button>
          </div>
          
          <!-- 系统音频录制 -->
          <div v-if="systemRecordingPath" class="bg-slate-800 rounded-lg p-3">
            <div class="flex items-center gap-2 mb-2">
              <span>🔊</span>
              <span class="text-sm text-slate-300 font-medium">系统音频</span>
            </div>
            <p class="text-xs text-slate-200 font-mono break-all mb-2">{{ systemRecordingPath }}</p>
            <Button 
              size="sm"
              class="bg-orange-600 hover:bg-orange-500"
              :disabled="isCapturing"
              @click="playSystemRecording"
            >
              <span class="mr-1">▶️</span>
              播放
            </Button>
          </div>
          
          <!-- 打开目录按钮 -->
          <Button 
            variant="outline" 
            size="sm"
            class="border-slate-700 text-slate-300 hover:bg-slate-800"
            :disabled="isCapturing"
            @click="openRecordingFolder"
          >
            <span class="mr-1">📂</span>
            在 Finder 中显示
          </Button>
        </CardContent>
      </Card>

      <!-- 音量显示 -->
      <Card class="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle class="text-white flex items-center gap-2">
            <span>📊</span>
            音量电平
            <Badge 
              :variant="isCapturing ? 'default' : 'secondary'"
              :class="isCapturing ? 'bg-green-600' : ''"
            >
              {{ isCapturing ? '采集中' : '已停止' }}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <!-- 麦克风音量条 -->
          <div class="space-y-2">
            <div class="flex justify-between text-sm text-slate-400">
              <span class="flex items-center gap-1"><span>🎤</span> 麦克风</span>
              <span>{{ Math.round(micLevel * 100) }}%</span>
            </div>
            <div class="relative h-5 bg-slate-800 rounded-full overflow-hidden">
              <div 
                class="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 rounded-full"
                :style="micLevelStyle"
              />
              <div 
                v-if="micPeak > 0"
                class="absolute top-0 bottom-0 w-0.5 bg-white/50"
                :style="micPeakStyle"
              />
              <div class="absolute inset-0 flex">
                <div v-for="i in 10" :key="i" class="flex-1 border-r border-slate-700/50 last:border-r-0" />
              </div>
            </div>
          </div>

          <!-- 系统音频音量条 -->
          <div class="space-y-2">
            <div class="flex justify-between text-sm text-slate-400">
              <span class="flex items-center gap-1"><span>🔊</span> 系统音频</span>
              <span>{{ Math.round(systemLevel * 100) }}%</span>
            </div>
            <div class="relative h-5 bg-slate-800 rounded-full overflow-hidden">
              <div 
                class="absolute inset-y-0 left-0 bg-gradient-to-r from-orange-500 via-yellow-500 to-red-500 rounded-full"
                :style="systemLevelStyle"
              />
              <div 
                v-if="systemPeak > 0"
                class="absolute top-0 bottom-0 w-0.5 bg-white/50"
                :style="systemPeakStyle"
              />
              <div class="absolute inset-0 flex">
                <div v-for="i in 10" :key="i" class="flex-1 border-r border-slate-700/50 last:border-r-0" />
              </div>
            </div>
          </div>

          <!-- dB 显示 -->
          <div class="grid grid-cols-2 gap-3 text-sm">
            <div class="bg-slate-800 rounded-lg p-3">
              <div class="text-slate-400 text-xs mb-1 flex items-center gap-1"><span>🎤</span> 麦克风</div>
              <div class="text-lg font-mono text-cyan-400">
                {{ micLevel > 0 ? (20 * Math.log10(micLevel)).toFixed(1) : '-∞' }} dB
              </div>
            </div>
            <div class="bg-slate-800 rounded-lg p-3">
              <div class="text-slate-400 text-xs mb-1 flex items-center gap-1"><span>🔊</span> 系统音频</div>
              <div class="text-lg font-mono text-orange-400">
                {{ systemLevel > 0 ? (20 * Math.log10(systemLevel)).toFixed(1) : '-∞' }} dB
              </div>
            </div>
          </div>

          <!-- 统计信息 -->
          <div v-if="captureStats.duration > 0" class="flex gap-4 text-sm text-slate-400">
            <div>⏱️ 时长: {{ formatDuration(captureStats.duration) }}</div>
            <div>📈 已处理: {{ (captureStats.samplesProcessed / 1000).toFixed(1) }}K 采样</div>
          </div>
        </CardContent>
      </Card>

      <!-- 控制按钮 -->
      <div class="flex justify-center gap-4">
        <Button
          v-if="!isCapturing"
          size="lg"
          class="px-8 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400"
          :disabled="!selectedMic"
          @click="startCapture"
        >
          <span class="mr-2">▶️</span>
          开始采集
        </Button>
        <Button
          v-else
          size="lg"
          variant="destructive"
          class="px-8"
          @click="stopCapture"
        >
          <span class="mr-2">⏹️</span>
          停止采集
        </Button>
      </div>

      <!-- 提示信息 -->
      <div class="text-center text-slate-500 text-sm">
        <p>💡 提示：首次使用需要授权麦克风和系统音频录制权限</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.animate-spin {
  animation: spin 1s linear infinite;
  display: inline-block;
}
</style>

