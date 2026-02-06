<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useModeStore } from '@/stores/mode'
import { useSessionStore } from '@/stores/session'
import { useAppStore } from '@/stores/app'
import { commands } from '@/types/bindings'
import MaterialIcon from './MaterialIcon.vue'
import { Button } from '@/components/ui/button'
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

// 获取模式图标名称
function getModeIconName(modeId: string): string {
  switch (modeId) {
    case 'meeting':
      return 'edit_note'
    case 'interviewer':
      return 'record_voice_over'
    case 'interviewee':
      return 'person'
    default:
      return 'edit_note'
  }
}

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
  <!-- Segmented Control 容器 -->
  <div
    class="flex items-center h-[30px] p-[2px] rounded-md"
    style="background-color: var(--la-bg-surface)"
  >
    <button
      v-for="mode in modeStore.availablePrimaryModes"
      :key="mode.id"
      class="flex items-center gap-1.5 px-3 py-1.5 rounded-[5px] text-xs transition-colors"
      :style="
        mode.id === modeStore.currentPrimaryModeId
          ? {
              backgroundColor: 'var(--la-accent)',
              color: 'var(--la-text-inverted)',
              fontWeight: '600',
            }
          : {
              color: 'var(--la-text-muted)',
              fontWeight: '500',
            }
      "
      @click="handleModeSwitch(mode.id)"
    >
      <MaterialIcon :name="getModeIconName(mode.id)" size="sm" />
      <span>{{ mode.name }}</span>
    </button>
  </div>

  <!-- 确认切换对话框 -->
  <Dialog :open="showConfirmDialog" @update:open="(v: boolean) => !v && cancelSwitch()">
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
