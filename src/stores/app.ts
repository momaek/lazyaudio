import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AppConfig, ThemeMode } from '@/types'

/**
 * 应用全局状态 Store
 */
export const useAppStore = defineStore('app', () => {
  // 状态
  const config = ref<AppConfig>({
    schema_version: 1,
    language: 'zh-CN',
    theme: 'system',
  })

  const isLoading = ref(false)

  // 计算属性
  const currentTheme = computed(() => config.value.theme)
  const currentLanguage = computed(() => config.value.language)

  // 方法
  function setTheme(theme: ThemeMode) {
    config.value.theme = theme
    applyTheme(theme)
  }

  function setLanguage(language: string) {
    config.value.language = language
  }

  function applyTheme(theme: ThemeMode) {
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
    applyTheme(config.value.theme)
    // 监听系统主题变化
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (config.value.theme === 'system') {
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
    // 计算属性
    currentTheme,
    currentLanguage,
    // 方法
    setTheme,
    setLanguage,
    initTheme,
  }
})

