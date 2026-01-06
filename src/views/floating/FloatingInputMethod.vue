<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Mic, Check, X, RotateCcw, Loader2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

// 状态
const isListening = ref(true)
const recognizedText = ref('')
const audioLevel = ref(0)

// 模拟音量变化
let levelInterval: ReturnType<typeof setInterval> | null = null

function startLevelSimulation() {
  levelInterval = setInterval(() => {
    if (isListening.value) {
      audioLevel.value = Math.random() * 100
    }
  }, 100)
}

function stopLevelSimulation() {
  if (levelInterval) {
    clearInterval(levelInterval)
    levelInterval = null
  }
  audioLevel.value = 0
}

// 模拟识别
let recognitionTimeout: ReturnType<typeof setTimeout> | null = null

function simulateRecognition() {
  const texts = [
    '这是一段',
    '这是一段测试',
    '这是一段测试文字',
    '这是一段测试文字，用于',
    '这是一段测试文字，用于演示',
    '这是一段测试文字，用于演示语音输入',
    '这是一段测试文字，用于演示语音输入功能。',
  ]
  let index = 0
  
  const update = () => {
    if (index < texts.length && isListening.value) {
      recognizedText.value = texts[index]
      index++
      recognitionTimeout = setTimeout(update, 500)
    }
  }
  
  update()
}

// 操作
function confirm() {
  // TODO: 复制到剪贴板并粘贴
  console.log('确认:', recognizedText.value)
  close()
}

function cancel() {
  recognizedText.value = ''
  close()
}

function retry() {
  recognizedText.value = ''
  isListening.value = true
  simulateRecognition()
}

function close() {
  // TODO: 调用 Tauri API 关闭窗口
  console.log('关闭')
}

// 键盘快捷键
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    confirm()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    cancel()
  } else if (e.key === 'Backspace' && e.metaKey) {
    e.preventDefault()
    retry()
  }
}

onMounted(() => {
  startLevelSimulation()
  simulateRecognition()
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  stopLevelSimulation()
  if (recognitionTimeout) {
    clearTimeout(recognitionTimeout)
  }
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="h-screen flex flex-col bg-background/80 backdrop-blur-xl rounded-xl border border-border overflow-hidden shadow-2xl">
    <!-- 状态提示 -->
    <div class="px-4 py-3 flex items-center gap-3 border-b border-border" data-tauri-drag-region>
      <div class="relative">
        <Mic
          class="h-5 w-5"
          :class="isListening ? 'text-red-500' : 'text-muted-foreground'"
        />
        <span
          v-if="isListening"
          class="absolute -top-1 -right-1 flex h-2 w-2"
        >
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span class="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
        </span>
      </div>
      <span class="text-sm">
        {{ isListening ? '正在听写...' : '识别完成' }}
      </span>
      <div class="flex-1" />
      <!-- 音量电平 -->
      <div class="w-24">
        <Progress :model-value="audioLevel" class="h-1.5" />
      </div>
    </div>

    <!-- 识别结果 -->
    <div class="flex-1 p-4 min-h-[80px]">
      <div v-if="recognizedText" class="text-base leading-relaxed">
        {{ recognizedText }}
        <span v-if="isListening" class="inline-block w-0.5 h-5 bg-primary animate-pulse ml-0.5" />
      </div>
      <div v-else class="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 v-if="isListening" class="h-5 w-5 animate-spin" />
        <span v-else>没有识别到内容</span>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="px-4 py-3 flex items-center justify-between border-t border-border bg-muted/30">
      <div class="flex items-center gap-2 text-xs text-muted-foreground">
        <kbd class="px-1.5 py-0.5 rounded bg-muted border text-[10px]">Enter</kbd>
        <span>确认</span>
        <kbd class="px-1.5 py-0.5 rounded bg-muted border text-[10px] ml-2">Esc</kbd>
        <span>取消</span>
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
  </div>
</template>

