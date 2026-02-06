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
  if (selectedMicrophone.value) {
    waveformBars.value = waveformBars.value.map(() => {
      const baseHeight = micLevel.value * 80
      return Math.max(20, baseHeight + Math.random() * 20)
    })
  } else {
    waveformBars.value = [20, 20, 20, 20, 20, 20]
  }

  if (selectedSystemAudio.value) {
    systemWaveformBars.value = systemWaveformBars.value.map(() => {
      const baseHeight = systemLevel.value * 80
      return Math.max(10, baseHeight + Math.random() * 15)
    })
  } else {
    systemWaveformBars.value = [10, 10, 10, 10, 10, 10]
  }
}

function toggleMicrophone() {
  if (selectedMicrophone.value) {
    selectedMicrophone.value = null
  } else {
    if (microphones.value.length > 0) {
      selectedMicrophone.value = microphones.value[0].id
    }
  }
}

function toggleSystemAudio() {
  if (selectedSystemAudio.value) {
    selectedSystemAudio.value = null
  } else {
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
  <div
    class="flex items-center gap-4 p-1.5 rounded-xl border"
    style="background-color: var(--la-bg-surface); border-color: var(--la-border)"
  >
    <!-- 麦克风控制 -->
    <div class="flex items-center gap-2 px-2">
      <button
        class="size-7 rounded-lg flex items-center justify-center transition-colors"
        :style="
          selectedMicrophone
            ? { backgroundColor: 'var(--la-accent)', color: 'var(--la-text-inverted)' }
            : { color: 'var(--la-text-secondary)' }
        "
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
          :style="{
            height: `${height}%`,
            backgroundColor: selectedMicrophone ? 'var(--la-accent)' : 'var(--la-border)',
          }"
        />
      </div>
    </div>

    <!-- 分隔线 -->
    <div class="w-px h-4" style="background-color: var(--la-border)" />

    <!-- 系统音频控制 -->
    <div class="flex items-center gap-2 px-2">
      <button
        class="size-7 rounded-lg flex items-center justify-center transition-colors"
        :style="
          selectedSystemAudio
            ? { backgroundColor: 'var(--la-accent)', color: 'var(--la-text-inverted)' }
            : { color: 'var(--la-text-secondary)' }
        "
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
          :style="{
            height: `${height}%`,
            backgroundColor: selectedSystemAudio ? 'var(--la-accent)' : 'var(--la-border)',
          }"
        />
      </div>
    </div>
  </div>
</template>
