import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ModeDefinition, BuiltinModeId } from '@/modes/types'
import { modeRegistry } from '@/modes/registry'

/**
 * Mode 状态管理 Store
 */
export const useModeStore = defineStore('mode', () => {
  // 状态
  /** 当前激活的主模式 ID */
  const currentPrimaryModeId = ref<string | null>(null)
  
  /** 当前激活的叠加模式 ID 列表 */
  const activeOverlayIds = ref<string[]>([])
  
  /** 是否正在切换模式 */
  const isSwitching = ref(false)

  // 计算属性
  /** 当前主模式定义 */
  const currentPrimaryMode = computed<ModeDefinition | null>(() => {
    if (!currentPrimaryModeId.value) return null
    return modeRegistry.get(currentPrimaryModeId.value) ?? null
  })

  /** 所有可用的主模式 */
  const availablePrimaryModes = computed<ModeDefinition[]>(() => {
    return modeRegistry.listPrimaryModes()
  })

  /** 所有叠加模式 */
  const availableOverlayModes = computed<ModeDefinition[]>(() => {
    return modeRegistry.listOverlayModes()
  })

  /** 当前激活的叠加模式 */
  const activeOverlays = computed<ModeDefinition[]>(() => {
    return activeOverlayIds.value
      .map(id => modeRegistry.get(id))
      .filter((mode): mode is ModeDefinition => mode !== undefined)
  })

  // 方法
  /**
   * 切换主模式
   * @param modeId 目标模式 ID
   */
  async function switchPrimaryMode(modeId: string | BuiltinModeId): Promise<boolean> {
    const targetMode = modeRegistry.get(modeId)
    if (!targetMode) {
      console.error(`[ModeStore] Mode "${modeId}" 不存在`)
      return false
    }

    if (targetMode.type !== 'primary') {
      console.error(`[ModeStore] Mode "${modeId}" 不是主模式`)
      return false
    }

    if (currentPrimaryModeId.value === modeId) {
      return true
    }

    isSwitching.value = true

    try {
      // 调用旧模式的 onDeactivate
      const oldMode = currentPrimaryMode.value
      if (oldMode?.hooks?.onDeactivate) {
        await oldMode.hooks.onDeactivate()
      }

      // 切换模式
      currentPrimaryModeId.value = modeId

      // 调用新模式的 onActivate
      if (targetMode.hooks?.onActivate) {
        await targetMode.hooks.onActivate()
      }

      console.log(`[ModeStore] 切换到模式: ${modeId}`)
      return true
    } catch (error) {
      console.error(`[ModeStore] 切换模式失败:`, error)
      return false
    } finally {
      isSwitching.value = false
    }
  }

  /**
   * 激活叠加模式
   */
  async function activateOverlay(modeId: string): Promise<boolean> {
    const mode = modeRegistry.get(modeId)
    if (!mode) {
      console.error(`[ModeStore] Overlay Mode "${modeId}" 不存在`)
      return false
    }

    if (mode.type !== 'overlay') {
      console.error(`[ModeStore] Mode "${modeId}" 不是叠加模式`)
      return false
    }

    if (activeOverlayIds.value.includes(modeId)) {
      return true
    }

    try {
      if (mode.hooks?.onActivate) {
        await mode.hooks.onActivate()
      }

      activeOverlayIds.value.push(modeId)
      console.log(`[ModeStore] 激活叠加模式: ${modeId}`)
      return true
    } catch (error) {
      console.error(`[ModeStore] 激活叠加模式失败:`, error)
      return false
    }
  }

  /**
   * 停用叠加模式
   */
  async function deactivateOverlay(modeId: string): Promise<boolean> {
    const index = activeOverlayIds.value.indexOf(modeId)
    if (index === -1) {
      return true
    }

    const mode = modeRegistry.get(modeId)
    try {
      if (mode?.hooks?.onDeactivate) {
        await mode.hooks.onDeactivate()
      }

      activeOverlayIds.value.splice(index, 1)
      console.log(`[ModeStore] 停用叠加模式: ${modeId}`)
      return true
    } catch (error) {
      console.error(`[ModeStore] 停用叠加模式失败:`, error)
      return false
    }
  }

  /**
   * 切换叠加模式
   */
  async function toggleOverlay(modeId: string): Promise<boolean> {
    if (activeOverlayIds.value.includes(modeId)) {
      return deactivateOverlay(modeId)
    } else {
      return activateOverlay(modeId)
    }
  }

  return {
    // 状态
    currentPrimaryModeId,
    activeOverlayIds,
    isSwitching,
    // 计算属性
    currentPrimaryMode,
    availablePrimaryModes,
    availableOverlayModes,
    activeOverlays,
    // 方法
    switchPrimaryMode,
    activateOverlay,
    deactivateOverlay,
    toggleOverlay,
  }
})

