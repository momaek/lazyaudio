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

  // 计算属性
  const currentTheme = computed(() => config.value?.general.theme ?? 'system')
  const currentLanguage = computed(() => config.value?.general.language ?? 'zh-cn')

  // 方法
  async function loadConfig() {
    isLoading.value = true
    try {
      const result = await commands.getConfig()
      if (result.status === 'ok') {
        config.value = result.data
        applyTheme(config.value.general.theme)
      } else {
        console.error('加载配置失败:', result.error)
      }
    } catch (error) {
      console.error('加载配置异常:', error)
    } finally {
      isLoading.value = false
      isInitialized.value = true
    }
  }

  async function saveConfig() {
    if (!config.value) return

    try {
      const result = await commands.setConfig(config.value)
      if (result.status === 'error') {
        console.error('保存配置失败:', result.error)
      }
    } catch (error) {
      console.error('保存配置异常:', error)
    }
  }

  function setTheme(theme: Theme) {
    if (!config.value) return
    config.value.general.theme = theme
    applyTheme(theme)
    saveConfig()
  }

  function setLanguage(language: 'zh-cn' | 'en-us') {
    if (!config.value) return
    config.value.general.language = language
    saveConfig()
  }

  function applyTheme(theme: Theme) {
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

  // 初始化时应用主题
  function initTheme() {
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

  return {
    // 状态
    config,
    isLoading,
    isInitialized,
    // 计算属性
    currentTheme,
    currentLanguage,
    // 方法
    loadConfig,
    saveConfig,
    setTheme,
    setLanguage,
    initTheme,
  }
})
