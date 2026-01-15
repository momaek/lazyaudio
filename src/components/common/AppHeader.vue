<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import ModeSwitcher from './ModeSwitcher.vue'
import RecordingPanel from './RecordingPanel.vue'
import AudioControlPanel from './AudioControlPanel.vue'
import MaterialIcon from './MaterialIcon.vue'
import { getCurrentWindow } from '@tauri-apps/api/window'

const router = useRouter()
const sessionStore = useSessionStore()

// AI 侧边栏状态（通过事件总线或store管理）
const isAiSidebarOpen = ref(false)

function goToHistory() {
  router.push('/history')
}

function goToSettings() {
  router.push('/settings')
}

function toggleAiSidebar() {
  isAiSidebarOpen.value = !isAiSidebarOpen.value
  // 触发全局事件或更新 store
  window.dispatchEvent(new CustomEvent('toggle-ai-sidebar', { detail: isAiSidebarOpen.value }))
}

const appWindow = getCurrentWindow()

function startHeaderDrag(event: MouseEvent) {
  if (event.button !== 0) return
  appWindow.startDragging().catch(() => {})
}
</script>

<template>
  <header 
    class="h-20 border-b bg-white dark:bg-background-dark/95 dark:backdrop-blur-xl z-30 shrink-0 border-border-light dark:border-border-dark"
  >
    <div class="h-full flex items-center px-6">
      <!-- 左侧：Logo + 名称 + 模式切换器 -->
      <div class="flex items-center gap-6 shrink-0">
        <div class="flex items-center gap-2.5">
          <div class="size-9 rounded bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
            <MaterialIcon name="graphic_eq" size="lg" />
          </div>
          <div class="flex flex-col leading-none font-display">
            <h1 class="text-sm font-bold tracking-tight">LazyAudio</h1>
            <span class="text-[10px] text-primary dark:text-primary-bright font-bold uppercase tracking-widest">Studio</span>
          </div>
        </div>
        
        <div class="h-8 w-px bg-border-light dark:bg-border-dark"></div>
        
        <!-- 模式切换器 -->
        <ModeSwitcher />
      </div>

      <!-- 中间：录制面板（仅录制时显示）+ 可拖拽区域 -->
      <div
        class="flex-1 flex items-center justify-center min-w-0"
        data-tauri-drag-region
        @mousedown="startHeaderDrag"
      >
        <RecordingPanel />
      </div>

      <!-- 右侧：音频控制 + 功能按钮 -->
      <div class="flex items-center gap-4 shrink-0">
        <!-- 音频控制面板 -->
        <AudioControlPanel />
        
        <div class="h-8 w-px bg-border-light dark:bg-border-dark"></div>
        
        <!-- 功能按钮组 -->
        <div class="flex items-center gap-1">
          <!-- 历史记录 -->
          <button
            class="size-10 rounded-xl flex items-center justify-center transition-all text-text-muted dark:text-text-muted-dark hover:text-text-main dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5"
            title="历史记录"
            @click="goToHistory"
          >
            <MaterialIcon name="history" />
          </button>

          <!-- 设置 -->
          <button
            class="size-10 rounded-xl flex items-center justify-center transition-all text-text-muted dark:text-text-muted-dark hover:text-text-main dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5"
            title="设置"
            @click="goToSettings"
          >
            <MaterialIcon name="settings" />
          </button>

          <!-- AI Toggle -->
          <button
            class="size-10 rounded-xl flex items-center justify-center transition-all"
            :class="[
              isAiSidebarOpen
                ? 'bg-primary/10 dark:bg-primary-bright/10 text-primary dark:text-primary-bright'
                : 'text-text-muted dark:text-text-muted-dark hover:text-text-main dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5'
            ]"
            title="AI Insights"
            @click="toggleAiSidebar"
          >
            <MaterialIcon name="auto_awesome" size="lg" :fill="isAiSidebarOpen" />
          </button>
        </div>
      </div>
    </div>
  </header>
</template>
