import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { commands } from '@/types'

/**
 * 引导流程步骤
 */
export type OnboardingStep = 'permission' | 'model' | 'complete'

/**
 * 引导流程 Composable
 */
export function useOnboarding() {
  const router = useRouter()
  const appStore = useAppStore()

  // 状态
  const currentStep = ref<OnboardingStep>('permission')
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // 计算属性
  const isComplete = computed(() => currentStep.value === 'complete')

  /**
   * 检查权限状态
   */
  async function checkPermissions(): Promise<boolean> {
    try {
      const allGranted = await commands.allRequiredPermissionsGranted()
      return allGranted
    } catch (e) {
      console.error('[Onboarding] 检查权限失败:', e)
      error.value = '检查权限失败'
      return false
    }
  }

  /**
   * 检查模型状态
   */
  async function checkModels(): Promise<boolean> {
    try {
      const result = await commands.hasAnyModelDownloaded()
      return result.status === 'ok' && result.data === true
    } catch (e) {
      console.error('[Onboarding] 检查模型失败:', e)
      error.value = '检查模型失败'
      return false
    }
  }

  /**
   * 权限步骤完成
   */
  async function completePermissionStep() {
    isLoading.value = true
    error.value = null

    try {
      const hasModel = await checkModels()
      if (!hasModel) {
        currentStep.value = 'model'
        router.push('/onboarding/model')
      } else {
        await completeOnboarding()
      }
    } catch (e) {
      console.error('[Onboarding] 完成权限步骤失败:', e)
      error.value = '操作失败'
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 模型步骤完成
   */
  async function completeModelStep() {
    await completeOnboarding()
  }

  /**
   * 完成引导流程
   */
  async function completeOnboarding() {
    currentStep.value = 'complete'
    appStore.setOnboardingCompleted(true)
    
    // 跳转到主页或上次使用的模式
    const lastMode = appStore.getLastMode()
    if (lastMode) {
      router.push(`/mode/${lastMode}`)
    } else {
      router.push('/home')
    }
  }

  /**
   * 返回上一步
   */
  function goBack() {
    if (currentStep.value === 'model') {
      currentStep.value = 'permission'
      router.push('/onboarding/permission')
    }
  }

  /**
   * 初始化引导流程
   */
  async function initialize() {
    isLoading.value = true
    error.value = null

    try {
      // 检查权限
      const permissionsOk = await checkPermissions()
      if (!permissionsOk) {
        currentStep.value = 'permission'
        return
      }

      // 检查模型
      const modelsOk = await checkModels()
      if (!modelsOk) {
        currentStep.value = 'model'
        return
      }

      // 都完成了
      await completeOnboarding()
    } catch (e) {
      console.error('[Onboarding] 初始化失败:', e)
      error.value = '初始化失败'
      currentStep.value = 'permission'
    } finally {
      isLoading.value = false
    }
  }

  return {
    // 状态
    currentStep,
    isLoading,
    error,
    // 计算属性
    isComplete,
    // 方法
    checkPermissions,
    checkModels,
    completePermissionStep,
    completeModelStep,
    completeOnboarding,
    goBack,
    initialize,
  }
}

