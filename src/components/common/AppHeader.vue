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
  <header class="h-14 border-b border-border/50 bg-card/80 backdrop-blur-md sticky top-0 z-50">
    <div class="h-full px-4 flex items-center justify-between">
      <!-- 左侧：模式切换器 -->
      <div class="flex items-center gap-3">
        <ModeSwitcher />
      </div>

      <!-- 右侧：状态和操作 -->
      <div class="flex items-center gap-1">
        <!-- 录制状态胶囊 -->
        <RecordingPill />

        <!-- 命令面板 -->
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                class="h-9 w-9 text-muted-foreground hover:text-foreground"
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
                class="h-9 w-9 text-muted-foreground hover:text-foreground"
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
                class="h-9 w-9 text-muted-foreground hover:text-foreground"
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
