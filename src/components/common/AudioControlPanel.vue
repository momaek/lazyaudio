<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useAudioSources, useAudioLevel } from '@/composables/useAudio'
import MaterialIcon from './MaterialIcon.vue'

const { microphones, systemSources } = useAudioSources()
const { micLevel, systemLevel } = useAudioLevel()

// 选择状态
const selectedMicrophone = ref<string | null>(null)
const selectedSystemAudio = ref<string | null>(null)

// 波形条数据（基于实际音频电平）
const waveformBars = ref([60, 40, 80, 30, 50, 20])
const systemWaveformBars = ref([10, 10, 10, 10, 10, 10])

// 更新波形动画
let waveformInterval: ReturnType<typeof setInterval> | null = null

function updateWaveform() {
  // 麦克风波形（如果激活）
  if (selectedMicrophone.value) {
    waveformBars.value = waveformBars.value.map(() => {
      // 基于实际音量生成随机高度
      const baseHeight = micLevel.value * 80
      return Math.max(20, baseHeight + Math.random() * 20)
    })
  } else {
    waveformBars.value = [20, 20, 20, 20, 20, 20]
  }

  // 系统音频波形（如果激活）
  if (selectedSystemAudio.value) {
    systemWaveformBars.value = systemWaveformBars.value.map(() => {
      const baseHeight = systemLevel.value * 80
      return Math.max(10, baseHeight + Math.random() * 15)
    })
  } else {
    systemWaveformBars.value = [10, 10, 10, 10, 10, 10]
  }
}

// 切换麦克风状态
function toggleMicrophone() {
  if (selectedMicrophone.value) {
    selectedMicrophone.value = null
  } else {
    // 选择第一个可用麦克风
    if (microphones.value.length > 0) {
      selectedMicrophone.value = microphones.value[0].id
    }
  }
}

// 切换系统音频状态
function toggleSystemAudio() {
  if (selectedSystemAudio.value) {
    selectedSystemAudio.value = null
  } else {
    // 选择第一个可用系统音频源
    if (systemSources.value.length > 0) {
      selectedSystemAudio.value = systemSources.value[0].id
    }
  }
}

onMounted(() => {
  waveformInterval = setInterval(updateWaveform, 100)
})

onUnmounted(() => {
  if (waveformInterval) {
    clearInterval(waveformInterval)
  }
})
</script>

<template>
  <div class="flex items-center gap-4 bg-gray-50 dark:bg-surface-dark/40 p-1.5 rounded-xl border border-border-light dark:border-border-dark">
    <!-- 麦克风控制 -->
    <div class="flex items-center gap-2 px-2">
      <button
        class="size-7 rounded-lg flex items-center justify-center transition-colors"
        :class="[
          selectedMicrophone
            ? 'bg-primary text-white'
            : 'text-text-muted dark:text-text-muted-dark hover:text-text-main dark:hover:text-white'
        ]"
        :title="selectedMicrophone ? '关闭麦克风' : '开启麦克风'"
        @click="toggleMicrophone"
      >
        <MaterialIcon name="mic" size="sm" />
      </button>
      
      <!-- 波形条 -->
      <div class="flex items-end gap-[1px] h-3 w-8">
        <div
          v-for="(height, index) in waveformBars"
          :key="index"
          class="waveform-bar w-[2px] rounded-[1px] transition-all duration-100"
          :style="{ height: `${height}%` }"
          :class="[
            selectedMicrophone ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'
          ]"
        />
      </div>
    </div>

    <!-- 分隔线 -->
    <div class="w-px h-4 bg-border-light dark:bg-border-dark" />

    <!-- 系统音频控制 -->
    <div class="flex items-center gap-2 px-2">
      <button
        class="size-7 rounded-lg flex items-center justify-center transition-colors"
        :class="[
          selectedSystemAudio
            ? 'bg-primary text-white'
            : 'text-text-muted dark:text-text-muted-dark hover:text-text-main dark:hover:text-white'
        ]"
        :title="selectedSystemAudio ? '关闭系统音频' : '开启系统音频'"
        @click="toggleSystemAudio"
      >
        <MaterialIcon name="laptop_mac" size="sm" />
      </button>
      
      <!-- 波形条 -->
      <div class="flex items-end gap-[1px] h-3 w-8">
        <div
          v-for="(height, index) in systemWaveformBars"
          :key="index"
          class="waveform-bar w-[2px] rounded-[1px] transition-all duration-100"
          :style="{ height: `${height}%` }"
          :class="[
            selectedSystemAudio ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'
          ]"
        />
      </div>
    </div>
  </div>
</template>
