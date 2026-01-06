/**
 * 自动滚动 Composable
 *
 * 提供转录内容的自动滚动功能
 */

import { ref, watch, nextTick, onUnmounted, type Ref } from 'vue'

/**
 * 自动滚动 Hook
 *
 * @param containerRef - 滚动容器的 ref
 * @param watchSource - 监听的数据源（当数据变化时触发滚动）
 */
export function useAutoScroll<T>(
  containerRef: Ref<HTMLElement | null>,
  watchSource?: Ref<T>
) {
  // 状态
  const isAutoScrollEnabled = ref(true)
  const isUserScrolling = ref(false)
  const showScrollButton = ref(false)

  // 滚动检测阈值（距离底部多少像素内认为是"在底部"）
  const BOTTOM_THRESHOLD = 50

  // 用户停止滚动后恢复自动滚动的延迟（毫秒）
  const USER_SCROLL_TIMEOUT = 2000

  let userScrollTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * 滚动到底部
   */
  function scrollToBottom(behavior: ScrollBehavior = 'smooth'): void {
    if (!containerRef.value) return

    nextTick(() => {
      const el = containerRef.value
      if (el) {
        el.scrollTo({
          top: el.scrollHeight,
          behavior,
        })
      }
    })
  }

  /**
   * 检查是否在底部
   */
  function isAtBottom(): boolean {
    const el = containerRef.value
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD
  }

  /**
   * 处理滚动事件
   */
  function handleScroll(): void {
    const atBottom = isAtBottom()
    showScrollButton.value = !atBottom

    if (atBottom) {
      // 到达底部，重新启用自动滚动
      isAutoScrollEnabled.value = true
      isUserScrolling.value = false

      // 清除定时器
      if (userScrollTimer) {
        clearTimeout(userScrollTimer)
        userScrollTimer = null
      }
    } else {
      // 用户正在滚动
      isUserScrolling.value = true

      // 设置定时器，一段时间后如果用户没有继续滚动，恢复自动滚动
      if (userScrollTimer) {
        clearTimeout(userScrollTimer)
      }
      userScrollTimer = setTimeout(() => {
        // 如果用户停止滚动但不在底部，不自动恢复
        // 只有点击"滚动到底部"按钮或手动滚动到底部才恢复
      }, USER_SCROLL_TIMEOUT)
    }
  }

  /**
   * 启用自动滚动
   */
  function enableAutoScroll(): void {
    isAutoScrollEnabled.value = true
    isUserScrolling.value = false
    scrollToBottom()
  }

  /**
   * 禁用自动滚动
   */
  function disableAutoScroll(): void {
    isAutoScrollEnabled.value = false
  }

  /**
   * 切换自动滚动
   */
  function toggleAutoScroll(): void {
    if (isAutoScrollEnabled.value) {
      disableAutoScroll()
    } else {
      enableAutoScroll()
    }
  }

  // 监听数据变化，自动滚动
  if (watchSource) {
    watch(watchSource, () => {
      if (isAutoScrollEnabled.value && !isUserScrolling.value) {
        scrollToBottom()
      }
    })
  }

  // 清理
  onUnmounted(() => {
    if (userScrollTimer) {
      clearTimeout(userScrollTimer)
    }
  })

  return {
    // 状态
    isAutoScrollEnabled,
    isUserScrolling,
    showScrollButton,
    // 方法
    scrollToBottom,
    isAtBottom,
    handleScroll,
    enableAutoScroll,
    disableAutoScroll,
    toggleAutoScroll,
  }
}

/**
 * 用于 ScrollArea 组件的自动滚动 Hook
 *
 * 专门处理 radix-vue ScrollArea 组件的滚动
 */
export function useScrollAreaAutoScroll<T>(
  scrollAreaRef: Ref<{ $el: HTMLElement } | null>,
  watchSource?: Ref<T>
) {
  // 状态
  const isAutoScrollEnabled = ref(true)
  const isUserScrolling = ref(false)
  const showScrollButton = ref(false)

  const BOTTOM_THRESHOLD = 50

  /**
   * 获取 viewport 元素
   */
  function getViewport(): HTMLElement | null {
    return scrollAreaRef.value?.$el?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null
  }

  /**
   * 滚动到底部
   */
  function scrollToBottom(behavior: ScrollBehavior = 'smooth'): void {
    nextTick(() => {
      const viewport = getViewport()
      if (viewport) {
        viewport.scrollTo({
          top: viewport.scrollHeight,
          behavior,
        })
      }
    })
  }

  /**
   * 检查是否在底部
   */
  function isAtBottom(): boolean {
    const viewport = getViewport()
    if (!viewport) return true
    return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < BOTTOM_THRESHOLD
  }

  /**
   * 处理滚动事件
   */
  function handleScroll(): void {
    const atBottom = isAtBottom()
    showScrollButton.value = !atBottom

    if (atBottom) {
      isAutoScrollEnabled.value = true
      isUserScrolling.value = false
    } else {
      isUserScrolling.value = true
    }
  }

  /**
   * 启用自动滚动
   */
  function enableAutoScroll(): void {
    isAutoScrollEnabled.value = true
    isUserScrolling.value = false
    scrollToBottom()
  }

  // 监听数据变化，自动滚动
  if (watchSource) {
    watch(watchSource, () => {
      if (isAutoScrollEnabled.value && !isUserScrolling.value) {
        scrollToBottom()
      }
    })
  }

  return {
    // 状态
    isAutoScrollEnabled,
    isUserScrolling,
    showScrollButton,
    // 方法
    scrollToBottom,
    isAtBottom,
    handleScroll,
    enableAutoScroll,
  }
}

