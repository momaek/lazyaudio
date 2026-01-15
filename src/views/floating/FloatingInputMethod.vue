<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import MaterialIcon from '@/components/common/MaterialIcon.vue'
import { EventNames, useAppEvents } from '@/composables/useEvents'

// 状态
const isListening = ref(true)
const recognizedText = ref('Working on the new design...')
const audioLevel = ref(0)
const { on, offAll } = useAppEvents()

// 判断是否深色主题 (可以从系统或配置读取)
const isDark = ref(true)

// 操作
async function confirm() {
  await invoke('input_method_confirm')
}

async function cancel() {
  await invoke('input_method_cancel')
}

// 键盘快捷键
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    confirm()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    cancel()
  }
}

async function startListening() {
  await on(EventNames.INPUT_METHOD_ACTIVATED, () => {
    isListening.value = true
    recognizedText.value = ''
  })

  await on(EventNames.INPUT_METHOD_TEXT_CHANGED, (payload) => {
    isListening.value = true
    recognizedText.value = payload.text
  })

  await on(EventNames.INPUT_METHOD_CONFIRMED, (payload) => {
    recognizedText.value = payload.text
    isListening.value = false
  })

  await on(EventNames.INPUT_METHOD_CANCELLED, () => {
    recognizedText.value = ''
    isListening.value = false
  })

  await on(EventNames.AUDIO_LEVEL, (payload) => {
    audioLevel.value = Math.min(100, Math.max(0, payload.level * 100))
  })
}

onMounted(() => {
  startListening()
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  offAll()
  window.removeEventListener('keydown', handleKeydown)
  audioLevel.value = 0
})
</script>

<template>
  <div class="h-screen flex items-center justify-center p-4 bg-transparent">
    <!-- 悬浮条容器 -->
    <div 
      class="h-12 rounded-full px-4 flex items-center gap-4 min-w-[320px] max-w-md transition-all duration-300"
      :class="[
        isDark 
          ? 'glass-morphism hover:border-teal-vibrant/60' 
          : 'glass-morphism-light hover:border-teal-mute/60'
      ]"
      data-tauri-drag-region
    >
      <!-- 呼吸灯 -->
      <div class="relative flex items-center justify-center shrink-0">
        <div 
          class="breathing-led w-2 h-2 rounded-full"
          :class="[
            isListening 
              ? (isDark ? 'bg-green-400' : 'bg-green-500') 
              : (isDark ? 'bg-gray-500' : 'bg-gray-400')
          ]"
          :style="{ 
            boxShadow: isListening 
              ? (isDark ? '0 0 8px #4ade80' : '0 0 8px rgba(34,197,94,0.6)') 
              : 'none'
          }"
        />
      </div>

      <!-- 波形 SVG -->
      <div class="w-16 h-6 shrink-0 flex items-center overflow-hidden">
        <svg 
          class="w-full h-full opacity-80"
          :class="[isDark ? 'text-teal-vibrant' : 'text-teal-600']"
          viewBox="0 0 100 40"
        >
          <path 
            class="wave-line"
            d="M0 20 Q 25 5, 50 20 T 100 20"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-width="2.5"
          />
        </svg>
      </div>

      <!-- 文本内容 -->
      <div class="flex-1 truncate">
        <span 
          class="text-sm font-normal tracking-tight"
          :class="[
            recognizedText 
              ? (isDark ? 'text-white/90' : 'text-slate-800') 
              : (isDark ? 'text-white/40' : 'text-slate-400')
          ]"
        >
          {{ recognizedText || 'Listening...' }}
          <span 
            v-if="!recognizedText"
            class="opacity-40"
          >
            ...
          </span>
        </span>
      </div>

      <!-- 操作按钮 -->
      <div class="flex items-center gap-1 pl-2 ml-2"
        :class="[isDark ? 'border-l border-white/10' : 'border-l border-slate-200']"
      >
        <button 
          class="w-6 h-6 flex items-center justify-center transition-colors"
          :class="[isDark ? 'text-white/30 hover:text-white' : 'text-slate-400 hover:text-slate-900']"
          title="Confirm"
          @click="confirm"
        >
          <MaterialIcon name="check" size="sm" />
        </button>
        <button 
          class="w-6 h-6 flex items-center justify-center transition-colors"
          :class="[isDark ? 'text-white/30 hover:text-red-400' : 'text-slate-400 hover:text-red-500']"
          title="Cancel"
          @click="cancel"
        >
          <MaterialIcon name="close" size="sm" />
        </button>
      </div>
    </div>

    <!-- 键盘提示（悬浮在下方） -->
    <div 
      class="fixed bottom-8 flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest"
      :class="[isDark ? 'text-white/20' : 'text-slate-400/60']"
    >
      <span>Press</span>
      <kbd 
        class="px-2 py-1 rounded border text-[10px]"
        :class="[isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-300']"
      >
        ⌥ SPACE
      </kbd>
      <span>To Toggle</span>
    </div>
  </div>
</template>

<style scoped>
/* 已在 main.css 中定义 glass-morphism 和 breathing-led */
</style>
