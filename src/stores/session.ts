import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * Session 状态
 */
export type SessionState = 'created' | 'recording' | 'paused' | 'completed' | 'error'

/**
 * Session 信息
 */
export interface SessionInfo {
  id: string
  modeId: string
  state: SessionState
  startTime: number
  duration: number
  title?: string
}

/**
 * Session 状态管理 Store
 */
export const useSessionStore = defineStore('session', () => {
  // 状态
  /** 当前活跃的 Sessions */
  const activeSessions = ref<SessionInfo[]>([])
  
  /** 当前选中的 Session ID */
  const currentSessionId = ref<string | null>(null)

  // 计算属性
  /** 当前 Session */
  const currentSession = computed<SessionInfo | null>(() => {
    if (!currentSessionId.value) return null
    return activeSessions.value.find(s => s.id === currentSessionId.value) ?? null
  })

  /** 是否有录制中的 Session */
  const hasRecordingSession = computed<boolean>(() => {
    return activeSessions.value.some(s => s.state === 'recording')
  })

  /** 是否有暂停的 Session */
  const hasPausedSession = computed<boolean>(() => {
    return activeSessions.value.some(s => s.state === 'paused')
  })

  /** 是否有活跃的 Session (录制中或暂停) */
  const hasActiveSession = computed<boolean>(() => {
    return activeSessions.value.some(s => s.state === 'recording' || s.state === 'paused')
  })

  /** 录制中的 Session */
  const recordingSession = computed<SessionInfo | null>(() => {
    return activeSessions.value.find(s => s.state === 'recording') ?? null
  })

  // 方法
  /**
   * 添加 Session
   */
  function addSession(session: SessionInfo): void {
    activeSessions.value.push(session)
    if (!currentSessionId.value) {
      currentSessionId.value = session.id
    }
  }

  /**
   * 更新 Session 状态
   */
  function updateSessionState(sessionId: string, state: SessionState): void {
    const session = activeSessions.value.find(s => s.id === sessionId)
    if (session) {
      session.state = state
    }
  }

  /**
   * 更新 Session 时长
   */
  function updateSessionDuration(sessionId: string, duration: number): void {
    const session = activeSessions.value.find(s => s.id === sessionId)
    if (session) {
      session.duration = duration
    }
  }

  /**
   * 移除 Session
   */
  function removeSession(sessionId: string): void {
    const index = activeSessions.value.findIndex(s => s.id === sessionId)
    if (index !== -1) {
      activeSessions.value.splice(index, 1)
    }
    if (currentSessionId.value === sessionId) {
      currentSessionId.value = activeSessions.value[0]?.id ?? null
    }
  }

  /**
   * 设置当前 Session
   */
  function setCurrentSession(sessionId: string | null): void {
    currentSessionId.value = sessionId
  }

  /**
   * 清空所有 Sessions
   */
  function clearSessions(): void {
    activeSessions.value = []
    currentSessionId.value = null
  }

  /**
   * 格式化时长显示
   */
  function formatDuration(durationMs: number): string {
    const totalSeconds = Math.floor(durationMs / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  return {
    // 状态
    activeSessions,
    currentSessionId,
    // 计算属性
    currentSession,
    hasRecordingSession,
    hasPausedSession,
    hasActiveSession,
    recordingSession,
    // 方法
    addSession,
    updateSessionState,
    updateSessionDuration,
    removeSession,
    setCurrentSession,
    clearSessions,
    formatDuration,
  }
})

