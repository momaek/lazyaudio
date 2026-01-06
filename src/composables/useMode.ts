import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useModeStore } from '@/stores/mode'
import { useSessionStore } from '@/stores/session'
import { modeRegistry } from '@/modes/registry'
import type { ModeDefinition } from '@/modes/types'

/**
 * Mode 管理 Composable
 */
export function useMode() {
  const router = useRouter()
  const route = useRoute()
  const modeStore = useModeStore()
  const sessionStore = useSessionStore()

  // 计算属性
  const currentMode = computed(() => modeStore.currentPrimaryMode)
  const currentModeId = computed(() => modeStore.currentPrimaryModeId)
  const availableModes = computed(() => modeStore.availablePrimaryModes)
  const activeOverlays = computed(() => modeStore.activeOverlays)

  /**
   * 从路由参数获取当前 Mode ID
   */
  const routeModeId = computed(() => {
    return route.params.modeId as string | undefined
  })

  /**
   * 检查当前 Mode 是否与路由匹配
   */
  const isModeInSync = computed(() => {
    if (!routeModeId.value) return true
    return currentModeId.value === routeModeId.value
  })

  /**
   * 切换到指定模式
   */
  async function switchMode(modeId: string): Promise<boolean> {
    const success = await modeStore.switchPrimaryMode(modeId)
    if (success) {
      router.push(`/mode/${modeId}`)
    }
    return success
  }

  /**
   * 需要确认后切换模式（有活跃 Session 时）
   */
  async function switchModeWithConfirm(
    modeId: string,
    _options?: {
      onConfirm?: () => Promise<void>
      onCancel?: () => void
    }
  ): Promise<{ needConfirm: boolean; confirmed?: boolean }> {
    // 如果没有活跃 Session，直接切换
    if (!sessionStore.hasActiveSession) {
      await switchMode(modeId)
      return { needConfirm: false }
    }

    // 需要确认
    return { needConfirm: true }
  }

  /**
   * 获取 Mode 定义
   */
  function getMode(modeId: string): ModeDefinition | undefined {
    return modeRegistry.get(modeId)
  }

  /**
   * 同步路由和 Mode 状态
   */
  async function syncModeFromRoute(): Promise<void> {
    if (!routeModeId.value) return
    if (currentModeId.value === routeModeId.value) return

    const mode = getMode(routeModeId.value)
    if (mode && mode.type === 'primary') {
      await modeStore.switchPrimaryMode(routeModeId.value)
    }
  }

  /**
   * 激活叠加模式
   */
  async function activateOverlay(modeId: string): Promise<boolean> {
    return modeStore.activateOverlay(modeId)
  }

  /**
   * 停用叠加模式
   */
  async function deactivateOverlay(modeId: string): Promise<boolean> {
    return modeStore.deactivateOverlay(modeId)
  }

  /**
   * 切换叠加模式
   */
  async function toggleOverlay(modeId: string): Promise<boolean> {
    return modeStore.toggleOverlay(modeId)
  }

  return {
    // 计算属性
    currentMode,
    currentModeId,
    availableModes,
    activeOverlays,
    routeModeId,
    isModeInSync,
    // 方法
    switchMode,
    switchModeWithConfirm,
    getMode,
    syncModeFromRoute,
    activateOverlay,
    deactivateOverlay,
    toggleOverlay,
  }
}

