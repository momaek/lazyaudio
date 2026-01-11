<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { Mic, Check, X, RotateCcw, Loader2, Sparkles } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { EventNames, useAppEvents } from '@/composables/useEvents'

// 状态
const isListening = ref(false)
const recognizedText = ref('')
const audioLevel = ref(0)
const { on, offAll } = useAppEvents()
const statusLabel = computed(() => (isListening.value ? '正在聆听' : '等待输入'))
const statusClass = computed(() =>
  isListening.value ? 'bg-red-500/15 text-red-500' : 'bg-muted text-muted-foreground'
)
const isSpeaking = computed(() => audioLevel.value > 18 && isListening.value)
const glowClass = computed(() =>
  isSpeaking.value ? 'glow-speaking' : isListening.value ? 'glow-breathing' : 'glow-idle'
)

// 操作
async function confirm() {
  await invoke('input_method_confirm')
}

async function cancel() {
  await invoke('input_method_cancel')
}

async function retry() {
  recognizedText.value = ''
  await invoke('input_method_activate')
}

// 键盘快捷键
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    confirm()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    cancel()
  } else if (e.key === 'Backspace' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    retry()
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
  <div
    class="h-screen flex flex-col bg-gradient-to-br from-background/90 via-background/80 to-muted/40 backdrop-blur-xl rounded-3xl border border-border/60 overflow-hidden shadow-[0_20px_60px_-20px_rgba(0,0,0,0.35)]"
  >
    <!-- 标题栏 -->
    <div class="px-4 py-3 flex items-center gap-3 border-b border-border/60" data-tauri-drag-region>
      <div class="relative flex items-center justify-center h-10 w-10 rounded-full bg-muted/50">
        <div class="absolute inset-0 rounded-full glow-base" :class="glowClass" />
        <Mic class="h-4 w-4" :class="isListening ? 'text-red-500' : 'text-muted-foreground'" />
      </div>
      <div class="flex flex-col">
        <span class="text-sm font-medium">语音输入</span>
        <span class="text-[11px] text-muted-foreground">快捷键唤起 · 全局可用</span>
      </div>
      <div class="flex-1" />
      <span class="px-2 py-0.5 rounded-full text-[11px] font-medium" :class="statusClass">
        {{ statusLabel }}
      </span>
    </div>

    <!-- 识别结果 -->
    <div class="flex-1 px-4 py-3">
      <div class="h-full rounded-xl border border-border/60 bg-background/60 px-3 py-3">
        <div v-if="recognizedText" class="text-[15px] leading-relaxed">
          {{ recognizedText }}
          <span v-if="isListening" class="inline-block w-0.5 h-5 bg-primary animate-pulse ml-0.5" />
        </div>
        <div v-else class="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
          <Loader2 v-if="isListening" class="h-5 w-5 animate-spin" />
          <Sparkles v-else class="h-5 w-5" />
          <span class="text-sm">
            {{ isListening ? '正在捕捉语音...' : '说点什么，系统会自动转写' }}
          </span>
        </div>
      </div>
    </div>

    <!-- 操作区 -->
    <div class="px-4 py-3 border-t border-border/60 bg-muted/30 space-y-3">
      <div class="flex items-center gap-3">
        <div class="flex-1">
          <Progress :model-value="audioLevel" class="h-1.5" />
          <div class="mt-1 text-[11px] text-muted-foreground">输入音量</div>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="ghost" size="sm" class="h-8 gap-1" @click="retry">
            <RotateCcw class="h-3 w-3" />
            重说
          </Button>
          <Button variant="ghost" size="sm" class="h-8 gap-1" @click="cancel">
            <X class="h-3 w-3" />
            取消
          </Button>
          <Button size="sm" class="h-8 gap-1" @click="confirm">
            <Check class="h-3 w-3" />
            确认
          </Button>
        </div>
      </div>
      <div class="flex items-center justify-between text-[11px] text-muted-foreground">
        <div class="flex items-center gap-2">
          <kbd class="px-1.5 py-0.5 rounded bg-muted border text-[10px]">Enter</kbd>
          确认
          <kbd class="px-1.5 py-0.5 rounded bg-muted border text-[10px] ml-2">Esc</kbd>
          取消
        </div>
        <div>Cmd/Ctrl + Backspace 重说</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.glow-base {
  box-shadow: 0 0 0 rgba(239, 68, 68, 0);
}

.glow-idle {
  opacity: 0.15;
}

.glow-breathing {
  animation: glow-breathing 2.6s ease-in-out infinite;
}

.glow-speaking {
  animation: glow-speaking 0.7s ease-in-out infinite;
}

@keyframes glow-breathing {
  0% {
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.15);
    opacity: 0.35;
  }
  50% {
    box-shadow: 0 0 16px 6px rgba(239, 68, 68, 0.2);
    opacity: 0.7;
  }
  100% {
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.15);
    opacity: 0.35;
  }
}

@keyframes glow-speaking {
  0% {
    box-shadow: 0 0 6px 2px rgba(239, 68, 68, 0.35);
    opacity: 0.6;
  }
  50% {
    box-shadow: 0 0 22px 8px rgba(239, 68, 68, 0.45);
    opacity: 1;
  }
  100% {
    box-shadow: 0 0 6px 2px rgba(239, 68, 68, 0.35);
    opacity: 0.6;
  }
}
</style>
