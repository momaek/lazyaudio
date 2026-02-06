<script setup lang="ts">
import { ref } from 'vue'
import MaterialIcon from '@/components/common/MaterialIcon.vue'
import { ScrollArea } from '@/components/ui/scroll-area'

// 状态
const isPinned = ref(true)
const isRecording = ref(false)
const duration = ref('00:00:00')

// 模拟数据
const currentQuestion = ref(
  '请介绍一下你最近做过的一个项目，以及你在其中担任的角色和遇到的挑战。'
)
const suggestion = ref(
  `建议回答结构：
1. 项目背景：简要介绍项目的目标和规模
2. 你的角色：明确说明你的职责
3. 具体挑战：描述遇到的技术或协作难题
4. 解决方案：说明你是如何解决的
5. 成果：量化的结果或学到的经验

关键点：使用 STAR 方法，强调个人贡献，准备回答追问。`
)
const recentTranscript = ref(
  '面试官：好的，那我们开始吧。首先请你做一下自我介绍...'
)

function togglePin() {
  isPinned.value = !isPinned.value
}

function minimize() {
  console.log('最小化')
}

function close() {
  console.log('关闭')
}

function toggleRecording() {
  isRecording.value = !isRecording.value
}

function stopRecording() {
  isRecording.value = false
}
</script>

<template>
  <div class="h-screen flex items-center justify-center p-4 bg-transparent">
    <!-- 悬浮窗容器 480x320 -->
    <div
      class="w-[480px] h-[320px] rounded-2xl flex flex-col overflow-hidden border animate-float-appear"
      style="
        background-color: var(--la-bg-surface);
        opacity: 0.95;
        border-color: var(--la-accent);
      "
    >
      <!-- Header 40px -->
      <div
        class="h-10 px-3 flex items-center justify-between shrink-0"
        style="background-color: var(--la-bg-inset)"
        data-tauri-drag-region
      >
        <div class="flex items-center gap-2">
          <MaterialIcon name="person" size="sm" style="color: var(--la-accent)" />
          <span class="text-sm font-medium" style="color: var(--la-text-primary)">
            面试助手
          </span>
          <span
            v-if="isRecording"
            class="text-xs font-mono tabular-nums"
            style="color: var(--la-text-tertiary)"
          >
            {{ duration }}
          </span>
        </div>
        <div class="flex items-center gap-1">
          <button
            class="size-6 flex items-center justify-center rounded transition-colors"
            :style="{ color: isPinned ? 'var(--la-accent)' : 'var(--la-text-muted)' }"
            @click="togglePin"
          >
            <MaterialIcon name="push_pin" size="sm" :fill="isPinned" />
          </button>
          <button
            class="size-6 flex items-center justify-center rounded transition-colors"
            style="color: var(--la-text-muted)"
            @click="minimize"
          >
            <MaterialIcon name="minimize" size="sm" />
          </button>
          <button
            class="size-6 flex items-center justify-center rounded transition-colors"
            style="color: var(--la-text-muted)"
            @click="close"
          >
            <MaterialIcon name="close" size="sm" />
          </button>
        </div>
      </div>

      <!-- 主体 -->
      <ScrollArea class="flex-1">
        <div class="p-4 space-y-3">
          <!-- 当前问题 -->
          <div
            class="rounded-[10px] p-3 border"
            style="
              background-color: color-mix(in srgb, var(--la-accent) 8%, transparent);
              border-color: color-mix(in srgb, var(--la-accent) 20%, transparent);
            "
          >
            <p
              class="text-[10px] font-semibold uppercase tracking-wider mb-1"
              style="color: var(--la-accent)"
            >
              Detected Question
            </p>
            <p class="text-sm" style="color: var(--la-text-primary)">
              {{ currentQuestion }}
            </p>
          </div>

          <!-- 回答建议 -->
          <div class="rounded-[10px] p-3" style="background-color: var(--la-bg-inset)">
            <p
              class="text-[10px] font-semibold uppercase tracking-wider mb-2"
              style="color: var(--la-ai-purple)"
            >
              Suggested Answer
            </p>
            <pre
              class="whitespace-pre-wrap text-xs leading-relaxed"
              style="color: var(--la-text-secondary); font-family: 'Inter', sans-serif"
            >{{ suggestion }}</pre>
          </div>
        </div>
      </ScrollArea>

      <!-- Live transcript 条 48px -->
      <div
        class="h-12 px-4 flex items-center justify-between border-t shrink-0"
        style="border-color: var(--la-divider)"
      >
        <div class="flex items-center gap-2 flex-1 min-w-0">
          <span v-if="isRecording" class="recording-dot shrink-0" />
          <span
            class="text-xs truncate"
            style="color: var(--la-text-tertiary)"
          >
            {{ recentTranscript }}
          </span>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <button
            v-if="isRecording"
            class="px-2 py-1 rounded-md text-xs font-medium"
            style="color: var(--la-text-secondary)"
            @click="toggleRecording"
          >
            <MaterialIcon name="pause" size="sm" />
          </button>
          <button
            v-if="isRecording"
            class="px-2 py-1 rounded-md text-xs font-medium"
            style="color: var(--la-recording-red)"
            @click="stopRecording"
          >
            <MaterialIcon name="stop" size="sm" />
          </button>
          <button
            v-if="!isRecording"
            class="px-3 py-1 rounded-md text-xs font-medium"
            style="background-color: var(--la-accent); color: var(--la-text-inverted)"
            @click="toggleRecording"
          >
            开始
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
