<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useModeStore } from '@/stores/mode'
import { useSessionStore } from '@/stores/session'
import { useAppStore } from '@/stores/app'
import { commands } from '@/types/bindings'
import MaterialIcon from './MaterialIcon.vue'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const router = useRouter()
const modeStore = useModeStore()
const sessionStore = useSessionStore()
const appStore = useAppStore()

// 下拉菜单状态
const isOpen = ref(false)

// 确认对话框状态
const showConfirmDialog = ref(false)
const pendingModeId = ref<string | null>(null)
const isSwitching = ref(false)

// Click away 指令
const vClickAway = {
  mounted(el: HTMLElement, binding: any) {
    el.clickAwayEvent = function(event: Event) {
      if (!(el === event.target || el.contains(event.target as Node))) {
        binding.value(event)
      }
    }
    document.addEventListener('click', el.clickAwayEvent)
  },
  unmounted(el: any) {
    document.removeEventListener('click', el.clickAwayEvent)
  }
}

// 获取模式图标名称
function getModeIconName(modeId: string): string {
  switch (modeId) {
    case 'meeting':
      return 'video_chat'
    case 'interviewer':
      return 'record_voice_over'
    case 'interviewee':
      return 'person'
    default:
      return 'video_chat'
  }
}

// 获取模式颜色
function getModeColor(modeId: string) {
  switch (modeId) {
    case 'meeting':
      return 'text-brand-primary'
    case 'interviewer':
      return 'text-primary-light'
    case 'interviewee':
      return 'text-warning'
    default:
      return 'text-muted-foreground dark:text-text-muted-dark'
  }
}

// 获取模式描述
function getModeDescription(modeId: string) {
  switch (modeId) {
    case 'meeting':
      return '会议录制、实时转录'
    case 'interviewer':
      return '面试官模式、AI 辅助'
    case 'interviewee':
      return '面试者模式、提词辅助'
    default:
      return ''
  }
}

// 当前模式显示
const currentModeDisplay = computed(() => {
  const mode = modeStore.currentPrimaryMode
  if (!mode) {
    return { 
      name: '选择模式', 
      iconName: 'video_chat', 
      color: 'text-muted-foreground dark:text-text-muted-dark' 
    }
  }
  return {
    name: mode.name,
    iconName: getModeIconName(mode.id),
    color: getModeColor(mode.id),
  }
})

// 处理模式切换
async function handleModeSwitch(modeId: string) {
  if (modeId === modeStore.currentPrimaryModeId) {
    return
  }

  if (sessionStore.hasActiveSession) {
    pendingModeId.value = modeId
    showConfirmDialog.value = true
    return
  }

  await switchToMode(modeId)
}

// 执行模式切换
async function switchToMode(modeId: string) {
  const success = await modeStore.switchPrimaryMode(modeId)
  if (success) {
    appStore.setLastMode(modeId)
    router.push(`/mode/${modeId}`)
  }
}

// 确认切换
async function confirmSwitch() {
  if (!pendingModeId.value) return

  isSwitching.value = true
  try {
    // 1. 停止所有活跃的 Session
    const activeSessions = sessionStore.activeSessions.filter(
      (s) => s.state === 'recording' || s.state === 'paused'
    )
    for (const session of activeSessions) {
      try {
        await commands.sessionStop(session.id)
        sessionStore.updateSessionState(session.id, 'completed')
      } catch (e) {
        console.error(`[ModeSwitcher] 停止 Session ${session.id} 失败:`, e)
      }
    }

    // 2. 切换模式
    await switchToMode(pendingModeId.value)
  } finally {
    isSwitching.value = false
    showConfirmDialog.value = false
    pendingModeId.value = null
  }
}

// 取消切换
function cancelSwitch() {
  showConfirmDialog.value = false
  pendingModeId.value = null
}
</script>

<template>
  <div class="relative group">
    <button 
      class="flex items-center gap-3 px-4 py-2 rounded-xl bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark hover:border-brand-primary/50 dark:hover:border-primary-bright/30 transition-all hover:bg-gray-50 dark:hover:bg-white/5 shadow-sm"
      @click="() => { isOpen = !isOpen }"
    >
      <div class="flex items-center gap-2">
        <MaterialIcon 
          :name="currentModeDisplay.iconName" 
          size="md" 
          :fill="true"
          :class="currentModeDisplay.color" 
        />
        <div class="text-left">
          <p class="text-[10px] text-text-muted dark:text-text-muted-dark uppercase font-bold tracking-wider leading-none mb-0.5 font-display">
            Mode
          </p>
          <p class="text-xs font-bold text-text-main dark:text-white font-display">
            {{ currentModeDisplay.name }}
          </p>
        </div>
      </div>
      <MaterialIcon 
        name="expand_more" 
        size="sm" 
        class="text-text-muted dark:text-text-muted-dark transition-transform duration-200"
        :class="{ 'rotate-180': isOpen }"
      />
    </button>

    <!-- 下拉菜单 -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div 
        v-if="isOpen"
        v-click-away="() => { isOpen = false }"
        class="absolute top-full left-0 mt-2 w-56 bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl shadow-xl overflow-hidden z-50"
      >
        <div class="p-1.5 space-y-0.5">
          <button
            v-for="mode in modeStore.availablePrimaryModes"
            :key="mode.id"
            class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left"
            :class="[
              mode.id === modeStore.currentPrimaryModeId
                ? 'bg-brand-primary/10 dark:bg-primary-bright/10 text-brand-primary dark:text-primary-bright'
                : 'text-text-muted dark:text-text-muted-dark hover:text-text-main dark:hover:text-white hover:bg-gray-50 dark:hover:bg-white/5'
            ]"
            @click="() => { handleModeSwitch(mode.id); isOpen = false }"
          >
            <MaterialIcon 
              :name="getModeIconName(mode.id)" 
              size="sm"
              :fill="mode.id === modeStore.currentPrimaryModeId"
            />
            <span class="text-xs font-bold font-display">{{ mode.name }}</span>
            <MaterialIcon 
              v-if="mode.id === modeStore.currentPrimaryModeId"
              name="check" 
              size="sm"
              class="ml-auto"
            />
          </button>
        </div>
      </div>
    </Transition>
  </div>

  <!-- 确认切换对话框 -->
  <Dialog :open="showConfirmDialog" @update:open="(v) => !v && cancelSwitch()">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>切换模式</DialogTitle>
        <DialogDescription>
          当前正在录制，切换模式将结束本次录制。是否继续？
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" :disabled="isSwitching" @click="cancelSwitch">取消</Button>
        <Button :disabled="isSwitching" @click="confirmSwitch">
          <MaterialIcon v-if="isSwitching" name="progress_activity" size="sm" class="mr-2 animate-spin" />
          {{ isSwitching ? '正在切换...' : '确认切换' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
