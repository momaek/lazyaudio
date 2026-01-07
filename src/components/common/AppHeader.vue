<script setup lang="ts">
import { useRouter } from 'vue-router'
import ModeSwitcher from './ModeSwitcher.vue'
import RecordingPill from './RecordingPill.vue'
import { Search, History, Settings } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const router = useRouter()

function goToHistory() {
  router.push('/history')
}

function goToSettings() {
  router.push('/settings')
}

function openCommandPalette() {
  // TODO: 实现命令面板
  console.log('打开命令面板')
}
</script>

<template>
  <header 
    class="h-12 border-b border-border/40 bg-background/95 backdrop-blur-sm sticky top-0 z-50"
    data-tauri-drag-region
  >
    <div class="h-full flex items-center justify-between">
      <!-- 左侧：Logo + 模式切换器 (带 macOS 红绿灯按钮留白 ~78px) -->
      <div class="flex items-center gap-3 pl-[78px] pr-3">
        <div class="h-4 w-px bg-border/50"></div>
        <!-- Logo/品牌 -->
        <div class="flex items-center gap-2">
          <div class="w-6 h-6 rounded-md bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center">
            <span class="text-white text-xs font-bold">LA</span>
          </div>
          <span class="text-sm font-semibold text-foreground">LazyAudio</span>
        </div>
        
        <div class="h-4 w-px bg-border/50"></div>
        
        <!-- 模式切换器 -->
        <ModeSwitcher />
      </div>

      <!-- 右侧：状态和操作 -->
      <div class="flex items-center gap-1 pr-3">
        <!-- 录制状态胶囊 -->
        <RecordingPill />

        <!-- 命令面板 -->
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                class="h-8 w-8 text-muted-foreground hover:text-foreground"
                @click="openCommandPalette"
              >
                <Search class="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>命令面板 <kbd class="ml-1 text-xs opacity-60">⌘K</kbd></p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <!-- 历史记录 -->
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                class="h-8 w-8 text-muted-foreground hover:text-foreground"
                @click="goToHistory"
              >
                <History class="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>历史记录</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <!-- 设置 -->
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                class="h-8 w-8 text-muted-foreground hover:text-foreground"
                @click="goToSettings"
              >
                <Settings class="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>设置</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  </header>
</template>
