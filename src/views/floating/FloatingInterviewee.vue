<script setup lang="ts">
import { ref } from 'vue'
import { Pin, Minimize2, X, Pause, Square } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

// 状态
const isPinned = ref(true)
const isRecording = ref(false)
const duration = ref('00:00:00')

// 模拟数据
const currentQuestion = ref('请介绍一下你最近做过的一个项目，以及你在其中担任的角色和遇到的挑战。')
const suggestion = ref(`
**建议回答结构：**

1. **项目背景**：简要介绍项目的目标和规模
2. **你的角色**：明确说明你的职责
3. **具体挑战**：描述遇到的技术或协作难题
4. **解决方案**：说明你是如何解决的
5. **成果**：量化的结果或学到的经验

**关键点提醒：**
- 使用 STAR 方法（情境、任务、行动、结果）
- 强调你的个人贡献
- 准备好回答后续追问
`.trim())

const recentTranscript = ref('面试官：好的，那我们开始吧。首先请你做一下自我介绍...')

// 操作
function togglePin() {
  isPinned.value = !isPinned.value
}

function minimize() {
  // TODO: 调用 Tauri API 最小化窗口
  console.log('最小化')
}

function close() {
  // TODO: 调用 Tauri API 关闭窗口
  console.log('关闭')
}

function toggleRecording() {
  isRecording.value = !isRecording.value
}

function stopRecording() {
  isRecording.value = false
  // TODO: 结束录制
}
</script>

<template>
  <div class="h-screen flex flex-col bg-background/80 backdrop-blur-xl rounded-lg border border-border overflow-hidden">
    <!-- 标题栏 (可拖拽区域) -->
    <div
      class="h-10 px-3 flex items-center justify-between border-b border-border shrink-0"
      data-tauri-drag-region
    >
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium">面试助手</span>
        <span v-if="isRecording" class="text-xs text-muted-foreground tabular-nums">
          {{ duration }}
        </span>
      </div>
      <div class="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          class="h-6 w-6"
          :class="{ 'text-primary': isPinned }"
          @click="togglePin"
        >
          <Pin class="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon" class="h-6 w-6" @click="minimize">
          <Minimize2 class="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon" class="h-6 w-6" @click="close">
          <X class="h-3 w-3" />
        </Button>
      </div>
    </div>

    <!-- 主体内容 -->
    <ScrollArea class="flex-1">
      <div class="p-4 space-y-4">
        <!-- 当前问题 -->
        <div class="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3">
          <p class="text-xs font-medium text-amber-400 mb-1">识别到的问题</p>
          <p class="text-sm">{{ currentQuestion }}</p>
        </div>

        <!-- 回答建议 -->
        <div class="rounded-lg bg-card border p-3">
          <p class="text-xs font-medium text-cyan-400 mb-2">回答建议</p>
          <div class="prose prose-sm dark:prose-invert max-w-none">
            <pre class="whitespace-pre-wrap font-sans text-xs leading-relaxed">{{ suggestion }}</pre>
          </div>
        </div>

        <!-- 实时转录 -->
        <details class="group">
          <summary class="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
            实时转录
          </summary>
          <div class="mt-2 p-2 rounded bg-muted/50 text-xs">
            {{ recentTranscript }}
          </div>
        </details>
      </div>
    </ScrollArea>

    <!-- 底部控制栏 -->
    <div class="h-12 px-3 flex items-center justify-between border-t border-border shrink-0">
      <div class="flex items-center gap-2">
        <!-- 录制状态 -->
        <span
          v-if="isRecording"
          class="flex items-center gap-1.5 text-xs"
        >
          <span class="relative flex h-2 w-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span class="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
          录制中
        </span>
        <span v-else class="text-xs text-muted-foreground">
          待命
        </span>
      </div>

      <div class="flex items-center gap-2">
        <Button
          v-if="isRecording"
          variant="outline"
          size="sm"
          class="h-7 gap-1"
          @click="toggleRecording"
        >
          <Pause class="h-3 w-3" />
          暂停
        </Button>
        <Button
          v-if="isRecording"
          variant="destructive"
          size="sm"
          class="h-7 gap-1"
          @click="stopRecording"
        >
          <Square class="h-3 w-3" />
          结束
        </Button>
        <Button
          v-if="!isRecording"
          size="sm"
          class="h-7"
          @click="toggleRecording"
        >
          开始
        </Button>
      </div>
    </div>
  </div>
</template>

