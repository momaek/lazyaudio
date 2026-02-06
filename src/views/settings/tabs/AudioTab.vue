<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import MaterialIcon from '@/components/common/MaterialIcon.vue'
import SectionLabel from '@/components/common/SectionLabel.vue'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useConfig } from '@/composables/useConfig'
import type { AudioSource } from '@/types'

const { defaultMicrophone, defaultSystemSource, setDefaultMicrophone, setDefaultSystemSource } =
  useConfig()

const audioSources = ref<AudioSource[]>([])
const microphones = ref<AudioSource[]>([])
const isLoading = ref(false)

const selectedMic = ref(defaultMicrophone.value ?? '')
const selectedSystem = ref(defaultSystemSource.value ?? '')

async function loadDevices() {
  try {
    isLoading.value = true
    const [systemSources, mics] = await Promise.all([
      invoke<AudioSource[]>('list_system_audio_sources'),
      invoke<AudioSource[]>('list_microphones'),
    ])
    audioSources.value = systemSources
    microphones.value = mics

    if (!selectedMic.value) {
      const def = mics.find((s) => s.is_default)
      if (def) selectedMic.value = def.id
    }
    if (!selectedSystem.value) {
      const def = systemSources.find((s) => s.is_default)
      if (def) selectedSystem.value = def.id
    }
  } catch (e) {
    console.error('加载音频设备失败:', e)
  } finally {
    isLoading.value = false
  }
}

async function saveMic(id: string | number | bigint | Record<string, any> | null) {
  const val = String(id ?? '')
  selectedMic.value = val
  await setDefaultMicrophone(val || null)
}

async function saveSystem(id: string | number | bigint | Record<string, any> | null) {
  const val = String(id ?? '')
  selectedSystem.value = val
  await setDefaultSystemSource(val || null)
}

onMounted(() => {
  loadDevices()
})
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-lg font-semibold mb-1" style="color: var(--la-text-primary)">音频设置</h2>
      <p class="text-sm" style="color: var(--la-text-tertiary)">配置默认音频输入设备</p>
    </div>

    <div class="rounded-[10px] p-5" style="background-color: var(--la-bg-surface)">
      <SectionLabel label="Default Devices" class="mb-4 block" />
      <div class="space-y-5">
        <!-- 麦克风 -->
        <div>
          <label class="text-sm font-medium mb-2 flex items-center gap-2">
            <MaterialIcon name="mic" size="sm" style="color: var(--la-text-secondary)" />
            <span style="color: var(--la-text-primary)">默认麦克风</span>
          </label>
          <Select :model-value="selectedMic" @update:model-value="saveMic">
            <SelectTrigger>
              <SelectValue placeholder="选择默认麦克风" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="mic in microphones" :key="mic.id" :value="mic.id">
                {{ mic.name }}
                <span
                  v-if="mic.is_default"
                  class="text-xs ml-2"
                  style="color: var(--la-tier2-green)"
                >
                  (系统默认)
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- 系统音频 -->
        <div>
          <label class="text-sm font-medium mb-2 flex items-center gap-2">
            <MaterialIcon name="laptop_mac" size="sm" style="color: var(--la-text-secondary)" />
            <span style="color: var(--la-text-primary)">默认系统音频源</span>
          </label>
          <Select :model-value="selectedSystem" @update:model-value="saveSystem">
            <SelectTrigger>
              <SelectValue placeholder="选择默认系统音频源" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="source in audioSources" :key="source.id" :value="source.id">
                {{ source.name }}
                <span
                  v-if="source.is_default"
                  class="text-xs ml-2"
                  style="color: var(--la-tier2-green)"
                >
                  (系统默认)
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <button
          class="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors"
          style="background-color: var(--la-bg-inset); color: var(--la-text-secondary)"
          :disabled="isLoading"
          @click="loadDevices"
        >
          <MaterialIcon
            name="refresh"
            size="sm"
            :class="{ 'animate-spin': isLoading }"
          />
          刷新设备列表
        </button>
      </div>
    </div>
  </div>
</template>
