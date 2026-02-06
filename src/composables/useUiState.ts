/**
 * UI 全局状态 Composable
 *
 * 管理跨组件共享的 UI 状态（如侧边栏、面板展开等）
 */

import { ref } from 'vue'

// 模块级单例状态，所有调用者共享
const isAiSidebarOpen = ref(false)

/**
 * UI 状态 Hook
 */
export function useUiState() {
  function toggleAiSidebar() {
    isAiSidebarOpen.value = !isAiSidebarOpen.value
  }

  function openAiSidebar() {
    isAiSidebarOpen.value = true
  }

  function closeAiSidebar() {
    isAiSidebarOpen.value = false
  }

  return {
    isAiSidebarOpen,
    toggleAiSidebar,
    openAiSidebar,
    closeAiSidebar,
  }
}
