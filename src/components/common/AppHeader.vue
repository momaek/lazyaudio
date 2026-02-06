<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUiState } from '@/composables/useUiState'
import ModeSwitcher from './ModeSwitcher.vue'
import RecordingPill from './RecordingPill.vue'
import MaterialIcon from './MaterialIcon.vue'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const router = useRouter()
const { isAiSidebarOpen, toggleAiSidebar } = useUiState()
const sessionStore = useSessionStore()

// 面包屑导航
const breadcrumb = computed(() => {
  const path = route.path
  if (path.startsWith('/history')) return 'History'
  if (path.startsWith('/settings')) return 'Settings'
  return null
})

// 是否有录制中的 session
const hasActiveRecording = computed(() => {
  return sessionStore.activeSessions.some(
    (s) => s.state === 'recording' || s.state === 'paused'
  )
})

function goToHistory() {
  router.push('/history')
}

function goToSettings() {
  router.push('/settings')
}

function goHome() {
  router.push('/')
}
</script>

<template>
  <header
    class="h-[52px] border-b shrink-0 z-30 select-none"
    style="background-color: var(--la-bg-inset); border-color: var(--la-divider)"
    data-tauri-drag-region
  >
    <div class="h-full flex items-center pr-4" data-tauri-drag-region>
      <!-- 左侧留白：macOS 红绿灯区域（约 80px） -->
      <div class="w-[80px] shrink-0" data-tauri-drag-region />

      <!-- Logo + 名称 + 面包屑 + 模式切换 + RecordingPill -->
      <div class="flex items-center gap-3 shrink-0">
        <!-- Logo -->
        <button class="flex items-center gap-2" @click="goHome">
          <div
            class="size-7 rounded-md flex items-center justify-center"
            style="background-color: var(--la-accent)"
          >
            <MaterialIcon name="mic" size="sm" style="color: var(--la-text-inverted)" />
          </div>
          <span
            class="text-[15px] font-semibold"
            style="color: var(--la-text-primary)"
          >
            LazyAudio
          </span>
        </button>

        <!-- 面包屑分隔符 + 页面名 -->
        <template v-if="breadcrumb">
          <span class="text-sm" style="color: var(--la-text-tertiary)">/</span>
          <span
            class="text-sm font-medium"
            style="color: var(--la-text-secondary)"
          >
            {{ breadcrumb }}
          </span>
        </template>

        <!-- 模式切换器 (仅主页 / 模式页面显示) -->
        <template v-if="!breadcrumb">
          <div class="h-5 w-px" style="background-color: var(--la-border)" />
          <ModeSwitcher />
        </template>

        <!-- RecordingPill (录制中显示) -->
        <RecordingPill v-if="hasActiveRecording" />
      </div>

      <!-- 中间可拖拽区域 -->
      <div class="flex-1 min-w-0" data-tauri-drag-region />

      <!-- 右侧功能按钮 -->
      <div class="flex items-center gap-1 shrink-0">
        <!-- 历史记录 -->
        <button
          class="size-8 rounded-md flex items-center justify-center transition-colors"
          style="color: var(--la-text-secondary)"
          title="历史记录"
          @click="goToHistory"
        >
          <MaterialIcon name="history" size="sm" />
        </button>

        <!-- 设置 -->
        <button
          class="size-8 rounded-md flex items-center justify-center transition-colors"
          style="color: var(--la-text-secondary)"
          title="设置"
          @click="goToSettings"
        >
          <MaterialIcon name="settings" size="sm" />
        </button>

        <!-- AI Insights 按钮 -->
        <button
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
          :style="
            isAiSidebarOpen
              ? { backgroundColor: 'var(--la-ai-purple)', color: 'var(--la-text-inverted)' }
              : { backgroundColor: 'var(--la-bg-surface)', color: 'var(--la-text-secondary)' }
          "
          title="AI Insights"
          @click="toggleAiSidebar"
        >
          <MaterialIcon name="psychology" size="sm" :fill="isAiSidebarOpen" />
          <span>AI</span>
        </button>
      </div>
    </div>
  </header>
</template>
