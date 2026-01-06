/**
 * Session 管理 Composable
 *
 * 提供 Session 的创建、控制和状态管理功能
 */

import { ref, computed, onMounted, onUnmounted, type Ref } from 'vue'
import { commands, type SessionMeta, type SessionRecord, type SessionConfig } from '@/types/bindings'
import { useSessionStore } from '@/stores/session'
import { EventNames, useAppEvents } from './useEvents'

// ============================================================================
// 类型定义
// ============================================================================

/** Session 创建选项 */
export interface CreateSessionOptions {
  /** 模式 ID */
  modeId: string
  /** Session 名称 */
  name?: string
  /** 音频配置（使用后端的 SessionConfig） */
  config?: Partial<SessionConfig>
}

// ============================================================================
// useSession Composable
// ============================================================================

/**
 * Session 管理 Hook
 *
 * 提供创建、控制、监听 Session 的完整功能
 */
export function useSession() {
  const sessionStore = useSessionStore()

  // 状态
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // 计算属性
  const currentSession = computed(() => sessionStore.currentSession)
  const activeSessions = computed(() => sessionStore.activeSessions)
  const hasRecordingSession = computed(() => sessionStore.hasRecordingSession)
  const hasPausedSession = computed(() => sessionStore.hasPausedSession)
  const hasActiveSession = computed(() => sessionStore.hasActiveSession)

  /**
   * 创建 Session
   */
  async function createSession(options: CreateSessionOptions): Promise<string | null> {
    isLoading.value = true
    error.value = null

    try {
      // 构建 SessionConfig
      const config: SessionConfig = {
        modeId: options.modeId,
        name: options.name ?? null,
        audioSources: options.config?.audioSources ?? [],
        enableRecording: options.config?.enableRecording ?? true,
        useMicrophone: options.config?.useMicrophone ?? true,
        useSystemAudio: options.config?.useSystemAudio ?? false,
        microphonePriority: options.config?.microphonePriority ?? 50,
      }

      const result = await commands.sessionCreate(config)

      if (result.status === 'ok') {
        const sessionId = result.data
        // 添加到 store
        sessionStore.addSession({
          id: sessionId,
          modeId: options.modeId,
          state: 'created',
          startTime: Date.now(),
          duration: 0,
          title: options.name,
        })
        return sessionId
      } else {
        error.value = result.error
        return null
      }
    } catch (e) {
      error.value = String(e)
      return null
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 开始 Session
   */
  async function startSession(sessionId: string): Promise<boolean> {
    isLoading.value = true
    error.value = null

    try {
      const result = await commands.sessionStart(sessionId)
      if (result.status === 'ok') {
        sessionStore.updateSessionState(sessionId, 'recording')
        return true
      }
      error.value = result.error
      return false
    } catch (e) {
      error.value = String(e)
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 暂停 Session
   */
  async function pauseSession(sessionId: string): Promise<boolean> {
    isLoading.value = true
    error.value = null

    try {
      const result = await commands.sessionPause(sessionId)
      if (result.status === 'ok') {
        sessionStore.updateSessionState(sessionId, 'paused')
        return true
      }
      error.value = result.error
      return false
    } catch (e) {
      error.value = String(e)
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 恢复 Session
   */
  async function resumeSession(sessionId: string): Promise<boolean> {
    isLoading.value = true
    error.value = null

    try {
      const result = await commands.sessionResume(sessionId)
      if (result.status === 'ok') {
        sessionStore.updateSessionState(sessionId, 'recording')
        return true
      }
      error.value = result.error
      return false
    } catch (e) {
      error.value = String(e)
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 停止 Session
   */
  async function stopSession(sessionId: string): Promise<boolean> {
    isLoading.value = true
    error.value = null

    try {
      const result = await commands.sessionStop(sessionId)
      if (result.status === 'ok') {
        sessionStore.updateSessionState(sessionId, 'completed')
        return true
      }
      error.value = result.error
      return false
    } catch (e) {
      error.value = String(e)
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 删除 Session
   */
  async function deleteSession(sessionId: string): Promise<boolean> {
    isLoading.value = true
    error.value = null

    try {
      const result = await commands.deleteSession(sessionId)
      if (result.status === 'ok') {
        sessionStore.removeSession(sessionId)
        return true
      }
      error.value = result.error
      return false
    } catch (e) {
      error.value = String(e)
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 刷新活跃 Session 列表
   */
  async function refreshActiveSessions(): Promise<void> {
    try {
      const sessions = await commands.sessionListActive()
      // 清空并重新添加
      sessionStore.clearSessions()
      for (const info of sessions) {
        sessionStore.addSession({
          id: info.id,
          modeId: info.modeId,
          state: mapSessionStatus(info.status),
          startTime: Date.parse(info.createdAt),
          duration: info.durationMs,
          title: info.name ?? undefined,
        })
      }
    } catch (e) {
      console.error('[useSession] 刷新活跃 Session 失败:', e)
    }
  }

  /**
   * 映射 Session 状态
   */
  function mapSessionStatus(status: string): 'created' | 'recording' | 'paused' | 'completed' | 'error' {
    switch (status) {
      case 'Created':
      case 'created':
        return 'created'
      case 'Recording':
      case 'recording':
        return 'recording'
      case 'Paused':
      case 'paused':
        return 'paused'
      case 'Completed':
      case 'completed':
        return 'completed'
      case 'Error':
      case 'error':
        return 'error'
      default:
        return 'created'
    }
  }

  /**
   * 获取 Session 详情
   */
  async function getSession(sessionId: string): Promise<SessionMeta | null> {
    try {
      const result = await commands.getSession(sessionId)
      if (result.status === 'ok') {
        return result.data
      }
      return null
    } catch (e) {
      console.error('[useSession] 获取 Session 失败:', e)
      return null
    }
  }

  /**
   * 设置当前 Session
   */
  function setCurrentSession(sessionId: string | null): void {
    sessionStore.setCurrentSession(sessionId)
  }

  return {
    // 状态
    isLoading,
    error,
    // 计算属性
    currentSession,
    activeSessions,
    hasRecordingSession,
    hasPausedSession,
    hasActiveSession,
    // 方法
    createSession,
    startSession,
    pauseSession,
    resumeSession,
    stopSession,
    deleteSession,
    refreshActiveSessions,
    getSession,
    setCurrentSession,
  }
}

// ============================================================================
// useSessionControl Composable
// ============================================================================

/**
 * 单个 Session 控制 Hook
 *
 * 用于控制和监听单个 Session 的状态
 *
 * @param sessionId - Session ID
 */
export function useSessionControl(sessionId: Ref<string | null>) {
  const { on, offAll } = useAppEvents()

  // 状态
  const status = ref<'created' | 'recording' | 'paused' | 'completed' | 'error'>('created')
  const error = ref<string | null>(null)
  const isLoading = ref(false)

  // 计算属性
  const isRecording = computed(() => status.value === 'recording')
  const isPaused = computed(() => status.value === 'paused')
  const isCompleted = computed(() => status.value === 'completed')
  const hasError = computed(() => status.value === 'error')

  /**
   * 开始录制
   */
  async function start(): Promise<boolean> {
    if (!sessionId.value) return false
    isLoading.value = true

    try {
      const result = await commands.sessionStart(sessionId.value)
      if (result.status === 'ok') {
        status.value = 'recording'
        return true
      }
      error.value = result.error
      return false
    } catch (e) {
      error.value = String(e)
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 暂停录制
   */
  async function pause(): Promise<boolean> {
    if (!sessionId.value) return false
    isLoading.value = true

    try {
      const result = await commands.sessionPause(sessionId.value)
      if (result.status === 'ok') {
        status.value = 'paused'
        return true
      }
      error.value = result.error
      return false
    } catch (e) {
      error.value = String(e)
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 恢复录制
   */
  async function resume(): Promise<boolean> {
    if (!sessionId.value) return false
    isLoading.value = true

    try {
      const result = await commands.sessionResume(sessionId.value)
      if (result.status === 'ok') {
        status.value = 'recording'
        return true
      }
      error.value = result.error
      return false
    } catch (e) {
      error.value = String(e)
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 停止录制
   */
  async function stop(): Promise<boolean> {
    if (!sessionId.value) return false
    isLoading.value = true

    try {
      const result = await commands.sessionStop(sessionId.value)
      if (result.status === 'ok') {
        status.value = 'completed'
        return true
      }
      error.value = result.error
      return false
    } catch (e) {
      error.value = String(e)
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 切换录制状态（暂停/恢复）
   */
  async function togglePause(): Promise<boolean> {
    if (isPaused.value) {
      return resume()
    } else if (isRecording.value) {
      return pause()
    }
    return false
  }

  // 设置事件监听
  async function setupListeners() {
    await on(EventNames.SESSION_STARTED, (payload) => {
      if (sessionId.value && payload.sessionId === sessionId.value) {
        status.value = 'recording'
        error.value = null
      }
    })

    await on(EventNames.SESSION_PAUSED, (payload) => {
      if (sessionId.value && payload.sessionId === sessionId.value) {
        status.value = 'paused'
      }
    })

    await on(EventNames.SESSION_RESUMED, (payload) => {
      if (sessionId.value && payload.sessionId === sessionId.value) {
        status.value = 'recording'
      }
    })

    await on(EventNames.SESSION_ENDED, (payload) => {
      if (sessionId.value && payload.sessionId === sessionId.value) {
        status.value = 'completed'
      }
    })

    await on(EventNames.SESSION_ERROR, (payload) => {
      if (sessionId.value && payload.sessionId === sessionId.value) {
        status.value = 'error'
        error.value = payload.error
      }
    })
  }

  // 生命周期
  onMounted(() => {
    setupListeners()
  })

  onUnmounted(() => {
    offAll()
  })

  return {
    // 状态
    status,
    error,
    isLoading,
    // 计算属性
    isRecording,
    isPaused,
    isCompleted,
    hasError,
    // 方法
    start,
    pause,
    resume,
    stop,
    togglePause,
  }
}

// ============================================================================
// useSessionHistory Composable
// ============================================================================

/**
 * Session 历史记录 Hook
 *
 * 用于查询和管理历史 Session
 */
export function useSessionHistory() {
  // 状态
  const sessions = ref<SessionRecord[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const hasMore = ref(true)

  // 分页参数
  const limit = 20
  const offset = ref(0)

  /**
   * 加载历史记录
   */
  async function loadHistory(reset = false): Promise<void> {
    if (isLoading.value) return
    if (!reset && !hasMore.value) return

    isLoading.value = true
    error.value = null

    if (reset) {
      offset.value = 0
      sessions.value = []
      hasMore.value = true
    }

    try {
      const result = await commands.listSessions(limit, offset.value)
      if (result.status === 'ok') {
        const newSessions = result.data
        if (newSessions.length < limit) {
          hasMore.value = false
        }
        sessions.value.push(...newSessions)
        offset.value += newSessions.length
      } else {
        error.value = result.error
      }
    } catch (e) {
      error.value = String(e)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 刷新历史记录
   */
  async function refresh(): Promise<void> {
    await loadHistory(true)
  }

  /**
   * 删除历史记录
   */
  async function deleteHistory(sessionId: string): Promise<boolean> {
    try {
      const result = await commands.deleteSession(sessionId)
      if (result.status === 'ok') {
        sessions.value = sessions.value.filter((s) => s.id !== sessionId)
        return true
      } else {
        error.value = result.error
        return false
      }
    } catch (e) {
      error.value = String(e)
      return false
    }
  }

  /**
   * 加载更多
   */
  async function loadMore(): Promise<void> {
    await loadHistory(false)
  }

  // 组件挂载时加载
  onMounted(() => {
    loadHistory(true)
  })

  return {
    // 状态
    sessions,
    isLoading,
    error,
    hasMore,
    // 方法
    loadHistory,
    refresh,
    deleteHistory,
    loadMore,
  }
}

