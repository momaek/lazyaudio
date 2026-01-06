import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AppConfig, Theme } from '@/types'
import { commands } from '@/types'

/**
 * 应用全局状态 Store
 */
export const useAppStore = defineStore('app', () => {
  // 状态
  const config = ref<AppConfig | null>(null)
  const isLoading = ref(false)
  const isInitialized = ref(false)
  const onboardingCompleted = ref(false)

  // 计算属性
  const currentTheme = computed(() => config.value?.general.theme ?? 'system')
  const currentLanguage = computed(() => config.value?.general.language ?? 'zh-cn')

  // 方法
  
  /**
   * 初始化应用
   */
  async function initialize(): Promise<void> {
    if (isInitialized.value) return
    
    isLoading.value = true
    try {
      // 加载配置
      await loadConfig()
      
      // 初始化主题
      initTheme()
      
      // 检查引导完成状态 (从本地存储)
      const completed = localStorage.getItem('onboardingCompleted')
      onboardingCompleted.value = completed === 'true'
      
      isInitialized.value = true
    } catch (error) {
      console.error('[AppStore] 初始化失败:', error)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 加载配置
   */
  async function loadConfig(): Promise<void> {
    try {
      const result = await commands.getConfig()
      if (result.status === 'ok') {
        config.value = result.data
        applyTheme(config.value.general.theme)
      } else {
        console.error('[AppStore] 加载配置失败:', result.error)
      }
    } catch (error) {
      console.error('[AppStore] 加载配置异常:', error)
    }
  }

  /**
   * 保存配置
   */
  async function saveConfig(): Promise<void> {
    if (!config.value) return

    try {
      const result = await commands.setConfig(config.value)
      if (result.status === 'error') {
        console.error('[AppStore] 保存配置失败:', result.error)
      }
    } catch (error) {
      console.error('[AppStore] 保存配置异常:', error)
    }
  }

  /**
   * 设置主题
   */
  function setTheme(theme: Theme): void {
    if (!config.value) return
    config.value.general.theme = theme
    applyTheme(theme)
    saveConfig()
  }

  /**
   * 设置语言
   */
  function setLanguage(language: 'zh-cn' | 'en-us'): void {
    if (!config.value) return
    config.value.general.language = language
    saveConfig()
  }

  /**
   * 应用主题
   */
  function applyTheme(theme: Theme): void {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else if (theme === 'light') {
      root.classList.remove('dark')
    } else {
      // 跟随系统
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      if (prefersDark) {
        root.classList.add('dark')
      } else {
        root.classList.remove('dark')
      }
    }
  }

  /**
   * 初始化主题
   */
  function initTheme(): void {
    applyTheme(currentTheme.value)
    // 监听系统主题变化
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (currentTheme.value === 'system') {
        if (e.matches) {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }
      }
    })
  }

  /**
   * 设置引导完成状态
   */
  function setOnboardingCompleted(completed: boolean): void {
    onboardingCompleted.value = completed
    localStorage.setItem('onboardingCompleted', completed.toString())
  }

  /**
   * 获取上次使用的模式 (从本地存储)
   */
  function getLastMode(): string | null {
    return localStorage.getItem('lastMode')
  }

  /**
   * 保存上次使用的模式
   */
  function setLastMode(modeId: string): void {
    localStorage.setItem('lastMode', modeId)
  }

  return {
    // 状态
    config,
    isLoading,
    isInitialized,
    onboardingCompleted,
    // 计算属性
    currentTheme,
    currentLanguage,
    // 方法
    initialize,
    loadConfig,
    saveConfig,
    setTheme,
    setLanguage,
    initTheme,
    setOnboardingCompleted,
    getLastMode,
    setLastMode,
  }
})
