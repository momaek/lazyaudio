<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const greetMsg = ref('')
const name = ref('')

async function greet() {
  greetMsg.value = await invoke('greet', { name: name.value })
}

onMounted(() => {
  appStore.initTheme()
})
</script>

<template>
  <main class="min-h-screen bg-background text-foreground">
    <div class="container mx-auto px-4 py-16">
      <div class="flex flex-col items-center justify-center space-y-8">
        <!-- Logo 区域 -->
        <div class="flex items-center space-x-4">
          <img src="/tauri.svg" class="h-16 w-16" alt="Tauri logo" />
          <span class="text-4xl font-bold text-primary">LazyAudio</span>
        </div>

        <p class="text-lg text-muted-foreground">桌面实时音频转录应用</p>

        <!-- 测试卡片 -->
        <div class="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
          <h2 class="mb-4 text-xl font-semibold">Tauri 命令测试</h2>
          <form class="space-y-4" @submit.prevent="greet">
            <input
              id="greet-input"
              v-model="name"
              placeholder="输入你的名字..."
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
            <button
              type="submit"
              class="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              发送问候
            </button>
          </form>
          <p v-if="greetMsg" class="mt-4 rounded-md bg-muted p-3 text-sm">
            {{ greetMsg }}
          </p>
        </div>

        <!-- 主题切换 -->
        <div class="flex items-center space-x-2">
          <button
            class="rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
            @click="appStore.setTheme('light')"
          >
            浅色
          </button>
          <button
            class="rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
            @click="appStore.setTheme('dark')"
          >
            深色
          </button>
          <button
            class="rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
            @click="appStore.setTheme('system')"
          >
            跟随系统
          </button>
        </div>

        <!-- 功能预告 -->
        <div class="grid w-full max-w-2xl grid-cols-2 gap-4 pt-8">
          <div class="rounded-lg border bg-card p-4">
            <div class="mb-2 text-2xl">🎤</div>
            <h3 class="font-medium">实时转录</h3>
            <p class="text-sm text-muted-foreground">本地 AI 语音识别</p>
          </div>
          <div class="rounded-lg border bg-card p-4">
            <div class="mb-2 text-2xl">📝</div>
            <h3 class="font-medium">会议模式</h3>
            <p class="text-sm text-muted-foreground">自动记录会议内容</p>
          </div>
          <div class="rounded-lg border bg-card p-4">
            <div class="mb-2 text-2xl">⌨️</div>
            <h3 class="font-medium">输入法模式</h3>
            <p class="text-sm text-muted-foreground">语音转文字输入</p>
          </div>
          <div class="rounded-lg border bg-card p-4">
            <div class="mb-2 text-2xl">🤖</div>
            <h3 class="font-medium">AI 增强</h3>
            <p class="text-sm text-muted-foreground">智能摘要和问答</p>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>
