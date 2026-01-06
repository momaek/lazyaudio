import type { Router } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { commands } from '@/types'

/**
 * 导航守卫
 * 
 * 流程:
 * 1. 应用未初始化 → 等待初始化
 * 2. 引导未完成 → 重定向到 /onboarding
 * 3. 已完成引导 → 正常导航
 */
export function setupGuards(router: Router) {
  router.beforeEach(async (to, _from, next) => {
    const appStore = useAppStore()

    // 如果应用未初始化，先初始化
    if (!appStore.isInitialized) {
      await appStore.initialize()
    }

    // 引导页面路由，直接放行
    if (to.path.startsWith('/onboarding')) {
      next()
      return
    }

    // 悬浮窗路由，直接放行
    if (to.path.startsWith('/floating')) {
      next()
      return
    }

    // 开发测试页面，直接放行
    if (to.path.startsWith('/dev/')) {
      next()
      return
    }

    // 检查是否需要引导
    if (!appStore.onboardingCompleted) {
      // 检查权限
      try {
        const allGranted = await commands.allRequiredPermissionsGranted()
        if (!allGranted) {
          next('/onboarding/permission')
          return
        }

        // 检查模型
        const hasModel = await commands.hasAnyModelDownloaded()
        if (hasModel.status === 'ok' && !hasModel.data) {
          next('/onboarding/model')
          return
        }

        // 标记引导完成
        appStore.setOnboardingCompleted(true)
      } catch (error) {
        console.error('[Guards] 检查引导状态失败:', error)
        next('/onboarding/permission')
        return
      }
    }

    // 如果访问根路径或首页，尝试恢复上次使用的模式
    if (to.path === '/' || to.path === '/home' || to.name === 'root' || to.name === 'home') {
      const lastMode = appStore.getLastMode()
      if (lastMode) {
        next(`/mode/${lastMode}`)
        return
      }
    }

    next()
  })
}
