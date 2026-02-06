<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { type UnlistenFn } from '@tauri-apps/api/event'
import { events } from '@/types/bindings'
import MaterialIcon from '@/components/common/MaterialIcon.vue'
import SectionLabel from '@/components/common/SectionLabel.vue'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
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

async function loadAudioSources() {
  try {
    isLoading.value = true
    error.value = null

    const systemSources = await invoke<AudioSource[]>('list_system_audio_sources')
    audioSources.value = systemSources

    const mics = await invoke<AudioSource[]>('list_microphones')
    microphones.value = mics

    const defaultSource = audioSources.value.find((s) => s.is_default)
    if (defaultSource) selectedSource.value = defaultSource.id

    const defaultMic = microphones.value.find((s) => s.is_default)
    if (defaultMic) selectedMicrophone.value = defaultMic.id
  } catch (e) {
    error.value = `加载音频源失败: ${e}`
    console.error('加载音频源失败:', e)
  } finally {
    isLoading.value = false
  }
}

async function startCapture() {
  try {
    isLoading.value = true
    error.value = null

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

async function setupListeners() {
  const unlistenLevel = await events.audioLevelEvent.listen((event) => {
    const newMicLevel = event.payload.micLevel * 100
    const newAudioLevel = event.payload.systemLevel * 100
    micLevel.value = newMicLevel
    audioLevel.value = newAudioLevel
  })
  unlisten.push(unlistenLevel)
}

onMounted(async () => {
  await setupListeners()
})

onUnmounted(() => {
  unlisten.forEach((fn) => fn())
  if (isCapturing.value) {
    stopCapture()
  }
})
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-lg font-semibold mb-1" style="color: var(--la-text-primary)">开发者工具</h2>
      <p class="text-sm" style="color: var(--la-text-tertiary)">音频采集测试和调试工具</p>
    </div>

    <!-- 错误提示 -->
    <div
      v-if="error"
      class="p-3 rounded-lg flex items-start gap-3"
      style="background-color: color-mix(in srgb, var(--la-recording-red) 10%, transparent)"
    >
      <MaterialIcon
        name="error"
        size="sm"
        style="color: var(--la-recording-red)"
        class="shrink-0 mt-0.5"
      />
      <div>
        <p class="text-sm font-medium" style="color: var(--la-recording-red)">出错了</p>
        <p class="text-xs mt-0.5" style="color: var(--la-text-secondary)">{{ error }}</p>
      </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-2">
      <!-- 音频源选择 -->
      <div class="rounded-[10px] p-5" style="background-color: var(--la-bg-surface)">
        <SectionLabel label="Audio Sources" class="mb-4 block" />
        <div class="space-y-4">
          <!-- 系统音频 -->
          <div>
            <label class="text-sm font-medium mb-2 flex items-center gap-2">
              <MaterialIcon name="laptop_mac" size="sm" style="color: var(--la-text-secondary)" />
              <span style="color: var(--la-text-primary)">系统音频</span>
            </label>
            <Select v-model="selectedSource" :disabled="isCapturing">
              <SelectTrigger>
                <SelectValue placeholder="选择系统音频源" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="source in audioSources"
                  :key="source.id"
                  :value="source.id"
                >
                  {{ source.name }}
                  <span
                    v-if="source.is_default"
                    class="text-xs ml-2"
                    style="color: var(--la-tier2-green)"
                  >
                    (默认)
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- 麦克风 -->
          <div>
            <label class="text-sm font-medium mb-2 flex items-center gap-2">
              <MaterialIcon name="mic" size="sm" style="color: var(--la-text-secondary)" />
              <span style="color: var(--la-text-primary)">麦克风</span>
            </label>
            <Select v-model="selectedMicrophone" :disabled="isCapturing">
              <SelectTrigger>
                <SelectValue placeholder="选择麦克风" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="mic in microphones" :key="mic.id" :value="mic.id">
                  {{ mic.name }}
                  <span
                    v-if="mic.is_default"
                    class="text-xs ml-2"
                    style="color: var(--la-tier2-green)"
                  >
                    (默认)
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <button
            class="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors"
            style="background-color: var(--la-bg-inset); color: var(--la-text-secondary)"
            :disabled="isCapturing || isLoading"
            @click="loadAudioSources"
          >
            <MaterialIcon name="refresh" size="sm" :class="{ 'animate-spin': isLoading }" />
            刷新设备列表
          </button>
        </div>
      </div>

      <!-- 控制面板 -->
      <div class="rounded-[10px] p-5" style="background-color: var(--la-bg-surface)">
        <div class="flex items-center justify-between mb-4">
          <SectionLabel label="Control Panel" />
          <span
            class="text-xs font-medium px-2 py-0.5 rounded border"
            :style="{
              color: isCapturing ? 'var(--la-recording-red)' : 'var(--la-tier2-green)',
              borderColor: isCapturing ? 'var(--la-recording-red)' : 'var(--la-tier2-green)',
            }"
          >
            {{ isCapturing ? '测试中' : '就绪' }}
          </span>
        </div>
        <div class="space-y-4">
          <!-- 电平指示 -->
          <div class="space-y-3">
            <div>
              <div class="flex items-center justify-between text-sm mb-1">
                <span class="flex items-center gap-2">
                  <MaterialIcon
                    name="laptop_mac"
                    size="sm"
                    style="color: var(--la-text-secondary)"
                  />
                  <span style="color: var(--la-text-primary)">系统音频</span>
                </span>
                <span class="font-mono text-xs" style="color: var(--la-text-tertiary)">
                  {{ Math.round(audioLevel) }}%
                </span>
              </div>
              <Progress :model-value="audioLevel" class="h-2" />
            </div>
            <div>
              <div class="flex items-center justify-between text-sm mb-1">
                <span class="flex items-center gap-2">
                  <MaterialIcon name="mic" size="sm" style="color: var(--la-text-secondary)" />
                  <span style="color: var(--la-text-primary)">麦克风</span>
                </span>
                <span class="font-mono text-xs" style="color: var(--la-text-tertiary)">
                  {{ Math.round(micLevel) }}%
                </span>
              </div>
              <Progress :model-value="micLevel" class="h-2" />
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="flex gap-2">
            <button
              v-if="!isCapturing"
              class="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium"
              style="background-color: var(--la-accent); color: var(--la-text-inverted)"
              :disabled="isLoading || !selectedMicrophone"
              @click="startCapture"
            >
              <MaterialIcon name="play_arrow" size="sm" />
              开始测试
            </button>
            <button
              v-else
              class="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium"
              style="background-color: var(--la-recording-red); color: white"
              @click="stopCapture"
            >
              <MaterialIcon name="stop" size="sm" />
              停止测试
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 提示信息 -->
    <div class="rounded-[10px] p-4" style="background-color: var(--la-bg-surface)">
      <p class="text-sm" style="color: var(--la-text-secondary)">
        提示：选择音频源后点击"开始测试"，观察电平指示器变化来验证音频采集是否正常。
      </p>
    </div>
  </div>
</template>
