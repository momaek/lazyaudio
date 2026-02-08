<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import MaterialIcon from '@/components/common/MaterialIcon.vue'
import { EventNames, useAppEvents } from '@/composables/useEvents'
import { useAsrConfig } from '@/composables/useConfig'
import { getProviderDisplayName } from '@/composables/useAsrProvider'

const { asrProvider } = useAsrConfig()

// 状态
const isListening = ref(true)
const recognizedText = ref('')
const audioLevel = ref(0)
const { on, offAll } = useAppEvents()

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
    <!-- 悬浮窗容器 400x180 -->
    <div
      class="w-[400px] rounded-2xl flex flex-col overflow-hidden animate-float-appear"
      style="background-color: var(--la-bg-surface)"
      data-tauri-drag-region
    >
      <!-- Header 36px -->
      <div class="h-9 flex items-center gap-3 px-4 shrink-0">
        <MaterialIcon
          name="mic"
          size="sm"
          :style="{ color: isListening ? 'var(--la-recording-red)' : 'var(--la-text-muted)' }"
        />
        <!-- 进度条 -->
        <div
          class="w-20 h-[3px] rounded-full overflow-hidden"
          style="background-color: var(--la-bg-inset)"
        >
          <div
            class="h-full rounded-full transition-all duration-150"
            style="background-color: var(--la-accent)"
            :style="{ width: `${audioLevel}%` }"
          />
        </div>
        <span
          class="text-xs font-medium"
          :style="{ color: isListening ? 'var(--la-accent)' : 'var(--la-text-muted)' }"
        >
          {{ isListening ? 'Listening...' : 'Idle' }}
        </span>
        <span class="text-[10px]" style="color: var(--la-text-muted)">&middot;</span>
        <span class="text-[10px]" style="color: var(--la-text-muted)">
          {{ getProviderDisplayName(asrProvider) }}
        </span>
      </div>

      <!-- Body — 文本内容 -->
      <div class="flex-1 px-4 py-3 min-h-[80px]">
        <p
          class="text-base leading-relaxed"
          :style="{
            color: recognizedText ? 'var(--la-text-primary)' : 'var(--la-text-muted)',
          }"
        >
          {{ recognizedText || '开始说话...' }}
          <span
            v-if="isListening && !recognizedText"
            style="color: var(--la-text-tertiary)"
          >
            ...
          </span>
        </p>
      </div>

      <!-- Footer 44px -->
      <div
        class="h-11 flex items-center justify-end gap-2 px-4 border-t"
        style="border-color: var(--la-divider)"
      >
        <button
          class="px-3 py-1 rounded-md text-xs font-medium transition-colors"
          style="color: var(--la-text-secondary)"
          title="Cancel (Esc)"
          @click="cancel"
        >
          Cancel
          <kbd
            class="ml-1.5 px-1 py-0.5 rounded text-[10px]"
            style="background-color: var(--la-bg-inset); color: var(--la-text-tertiary)"
          >
            Esc
          </kbd>
        </button>
        <button
          class="px-3 py-1 rounded-md text-xs font-medium transition-colors"
          style="background-color: var(--la-accent); color: var(--la-text-inverted)"
          title="Confirm (Enter)"
          @click="confirm"
        >
          Confirm
          <kbd
            class="ml-1.5 px-1 py-0.5 rounded text-[10px] opacity-70"
          >
            ↵
          </kbd>
        </button>
      </div>
    </div>
  </div>
</template>
