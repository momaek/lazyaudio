import { ref, computed } from 'vue'
import { commands, fromRustPermissionStatus, toRustPermissionType } from '@/types'
import type { PermissionType, PermissionStatus, PermissionInfo } from '@/types'

/**
 * 权限管理 Composable
 */
export function usePermissions() {
  // 状态
  const permissions = ref<Map<PermissionType, PermissionInfo>>(new Map())
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // 计算属性
  const allGranted = computed(() => {
    if (permissions.value.size === 0) return false
    // 只检查必需权限（屏幕录制和麦克风）
    const screenCapture = permissions.value.get('ScreenCapture')
    const microphone = permissions.value.get('Microphone')
    return (
      (screenCapture?.status === 'Granted' || screenCapture?.status === 'NotApplicable') &&
      (microphone?.status === 'Granted' || microphone?.status === 'NotApplicable')
    )
  })

  const permissionList = computed(() => {
    return Array.from(permissions.value.entries()).map(([type, info]) => ({
      type,
      ...info,
    }))
  })

  /**
   * 检查所有权限状态
   */
  async function checkAllPermissions(): Promise<void> {
    isLoading.value = true
    error.value = null

    try {
      const result = await commands.checkAllPermissions()
      
      permissions.value.set('ScreenCapture', {
        status: fromRustPermissionStatus(result.systemAudioRecording),
      })
      permissions.value.set('Microphone', {
        status: fromRustPermissionStatus(result.microphone),
      })
      permissions.value.set('Accessibility', {
        status: fromRustPermissionStatus(result.accessibility),
      })
    } catch (e) {
      console.error('[Permissions] 检查权限失败:', e)
      error.value = '检查权限失败'
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 检查单个权限
   */
  async function checkPermission(type: PermissionType): Promise<PermissionStatus | null> {
    try {
      const rustType = toRustPermissionType(type)
      const result = await commands.checkPermission(rustType)
      const status = fromRustPermissionStatus(result)
      
      const info = permissions.value.get(type)
      if (info) {
        info.status = status
      } else {
        permissions.value.set(type, { status })
      }
      return status
    } catch (e) {
      console.error(`[Permissions] 检查权限 ${type} 失败:`, e)
      return null
    }
  }

  /**
   * 请求权限
   */
  async function requestPermission(type: PermissionType): Promise<boolean> {
    try {
      const rustType = toRustPermissionType(type)
      const result = await commands.requestPermission(rustType)
      const status = fromRustPermissionStatus(result)
      
      // 刷新权限状态
      await checkPermission(type)
      return status === 'Granted'
    } catch (e) {
      console.error(`[Permissions] 请求权限 ${type} 失败:`, e)
      return false
    }
  }

  /**
   * 打开系统权限设置
   */
  async function openSystemSettings(type: PermissionType): Promise<void> {
    try {
      const rustType = toRustPermissionType(type)
      await commands.openPermissionSettings(rustType)
    } catch (e) {
      console.error(`[Permissions] 打开设置失败:`, e)
    }
  }

  /**
   * 获取权限状态
   */
  function getPermissionStatus(type: PermissionType): PermissionStatus | undefined {
    return permissions.value.get(type)?.status
  }

  /**
   * 权限是否已授权
   */
  function isGranted(type: PermissionType): boolean {
    const status = getPermissionStatus(type)
    return status === 'Granted' || status === 'NotApplicable'
  }

  return {
    // 状态
    permissions,
    isLoading,
    error,
    // 计算属性
    allGranted,
    permissionList,
    // 方法
    checkAllPermissions,
    checkPermission,
    requestPermission,
    openSystemSettings,
    getPermissionStatus,
    isGranted,
  }
}
