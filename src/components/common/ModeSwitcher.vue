<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useModeStore } from '@/stores/mode'
import { useSessionStore } from '@/stores/session'
import { useAppStore } from '@/stores/app'
import { commands } from '@/types/bindings'
import { ChevronDown, Mic, UserSearch, User, Loader2 } from 'lucide-vue-next'
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

// 确认对话框状态
const showConfirmDialog = ref(false)
const pendingModeId = ref<string | null>(null)
const isSwitching = ref(false)

// 获取模式图标组件
function getModeIcon(modeId: string) {
  switch (modeId) {
    case 'meeting':
      return Mic
    case 'interviewer':
      return UserSearch
    case 'interviewee':
      return User
    default:
      return Mic
  }
}

// 获取模式颜色
function getModeColor(modeId: string) {
  switch (modeId) {
    case 'meeting':
      return 'text-la-indigo'
    case 'interviewer':
      return 'text-la-violet'
    case 'interviewee':
      return 'text-la-warning'
    default:
      return 'text-muted-foreground'
  }
}

// 当前模式显示
const currentModeDisplay = computed(() => {
  const mode = modeStore.currentPrimaryMode
  if (!mode) {
    return { name: '选择模式', icon: Mic, color: 'text-muted-foreground' }
  }
  return {
    name: mode.name,
    icon: getModeIcon(mode.id),
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
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" class="h-9 px-3 gap-2">
        <component :is="currentModeDisplay.icon" class="h-4 w-4" :class="currentModeDisplay.color" />
        <span class="font-medium">{{ currentModeDisplay.name }}</span>
        <ChevronDown class="h-3 w-3 opacity-50" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-48">
      <DropdownMenuLabel class="text-muted-foreground">切换模式</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        v-for="mode in modeStore.availablePrimaryModes"
        :key="mode.id"
        :class="{ 'bg-accent': mode.id === modeStore.currentPrimaryModeId }"
        @click="handleModeSwitch(mode.id)"
      >
        <component :is="getModeIcon(mode.id)" class="mr-2 h-4 w-4" :class="getModeColor(mode.id)" />
        <span>{{ mode.name }}</span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>

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
          <Loader2 v-if="isSwitching" class="mr-2 h-4 w-4 animate-spin" />
          {{ isSwitching ? '正在切换...' : '确认切换' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
