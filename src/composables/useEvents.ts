/**
 * 事件监听 Composable
 *
 * 封装 Tauri 事件监听，提供类型安全的事件订阅接口
 */

import { ref, onUnmounted, type Ref } from 'vue'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { AsrProviderType, TranscriptSegment } from '@/types/bindings'

// ============================================================================
// 事件类型定义
// ============================================================================

/** Session ID Payload */
export interface SessionIdPayload {
  sessionId: string
}

/** Session 创建 Payload */
export interface SessionCreatedPayload {
  sessionId: string
  modeId: string
  createdAt: string
}

/** Session 错误 Payload */
export interface SessionErrorPayload {
  sessionId: string
  error: string
}

/** 实时转录 Payload */
export interface TranscriptPartialPayload {
  sessionId: string
  text: string
  startTime: number
  endTime: number
  confidence?: number
}

/** 最终转录 Payload */
export interface TranscriptFinalPayload {
  sessionId: string
  segment: TranscriptSegment
}

/** 转录更新 Payload（Multi-pass Tier 2/3） */
export interface TranscriptUpdatedPayload {
  sessionId: string
  segmentId: string
  tier: 'tier1' | 'tier2' | 'tier3'
  text: string
  confidence: number
  segment: TranscriptSegment
}

/** 音频电平 Payload */
export interface AudioLevelPayload {
  sessionId: string
  level: number
  db: number
}

/** 语音活动 Payload */
export interface VoiceActivityPayload {
  sessionId: string
  isSpeaking: boolean
}

/** 麦克风抢占 Payload */
export interface MicrophonePreemptedPayload {
  sessionId: string
  preemptedBy: string
}

/** 模式 ID Payload */
export interface ModeIdPayload {
  modeId: string
}

/** AI 任务进度 Payload */
export interface AiTaskProgressPayload {
  taskId: string
  progress: number
  message?: string
}

/** AI 任务完成 Payload */
export interface AiTaskCompletedPayload {
  taskId: string
  result: string
}

/** AI 任务失败 Payload */
export interface AiTaskFailedPayload {
  taskId: string
  error: string
}

/** ASR 降级 Payload */
export interface AsrFallbackPayload {
  sessionId: string
  /** 原始 Provider */
  fromProvider: AsrProviderType
  /** 降级到的 Provider */
  toProvider: AsrProviderType
  /** 降级原因 */
  reason: string
}

/** 文本 Payload */
export interface TextPayload {
  text: string
}

// ============================================================================
// 事件名称常量
// ============================================================================

/** 事件名称 */
export const EventNames = {
  // Session 事件
  SESSION_CREATED: 'session:created',
  SESSION_STARTED: 'session:started',
  SESSION_PAUSED: 'session:paused',
  SESSION_RESUMED: 'session:resumed',
  SESSION_ENDED: 'session:ended',
  SESSION_ERROR: 'session:error',

  // 转录事件
  TRANSCRIPT_PARTIAL: 'transcript:partial',
  TRANSCRIPT_FINAL: 'transcript:final',
  TRANSCRIPT_UPDATED: 'transcript:updated',

  // 音频事件
  AUDIO_LEVEL: 'audio:level',
  VOICE_ACTIVITY: 'audio:voice-activity',

  // 麦克风事件
  MICROPHONE_ACQUIRED: 'microphone:acquired',
  MICROPHONE_RELEASED: 'microphone:released',
  MICROPHONE_PREEMPTED: 'microphone:preempted',

  // 模式事件
  MODE_ACTIVATED: 'mode:activated',
  MODE_DEACTIVATED: 'mode:deactivated',

  // AI 事件
  AI_TASK_CREATED: 'ai:task:created',
  AI_TASK_PROGRESS: 'ai:task:progress',
  AI_TASK_COMPLETED: 'ai:task:completed',
  AI_TASK_FAILED: 'ai:task:failed',

  // ASR 事件
  ASR_FALLBACK: 'asr:fallback',
  ASR_ERROR: 'asr:error',

  // 输入法事件
  INPUT_METHOD_ACTIVATED: 'input-method:activated',
  INPUT_METHOD_TEXT_CHANGED: 'input-method:text-changed',
  INPUT_METHOD_CONFIRMED: 'input-method:confirmed',
  INPUT_METHOD_CANCELLED: 'input-method:cancelled',
} as const

export type EventName = (typeof EventNames)[keyof typeof EventNames]

// ============================================================================
// 事件类型映射
// ============================================================================

/** 事件名到 Payload 类型的映射 */
export interface EventPayloadMap {
  [EventNames.SESSION_CREATED]: SessionCreatedPayload
  [EventNames.SESSION_STARTED]: SessionIdPayload
  [EventNames.SESSION_PAUSED]: SessionIdPayload
  [EventNames.SESSION_RESUMED]: SessionIdPayload
  [EventNames.SESSION_ENDED]: SessionIdPayload
  [EventNames.SESSION_ERROR]: SessionErrorPayload
  [EventNames.TRANSCRIPT_PARTIAL]: TranscriptPartialPayload
  [EventNames.TRANSCRIPT_FINAL]: TranscriptFinalPayload
  [EventNames.TRANSCRIPT_UPDATED]: TranscriptUpdatedPayload
  [EventNames.AUDIO_LEVEL]: AudioLevelPayload
  [EventNames.VOICE_ACTIVITY]: VoiceActivityPayload
  [EventNames.MICROPHONE_ACQUIRED]: SessionIdPayload
  [EventNames.MICROPHONE_RELEASED]: SessionIdPayload
  [EventNames.MICROPHONE_PREEMPTED]: MicrophonePreemptedPayload
  [EventNames.MODE_ACTIVATED]: ModeIdPayload
  [EventNames.MODE_DEACTIVATED]: ModeIdPayload
  [EventNames.AI_TASK_CREATED]: { taskId: string }
  [EventNames.AI_TASK_PROGRESS]: AiTaskProgressPayload
  [EventNames.AI_TASK_COMPLETED]: AiTaskCompletedPayload
  [EventNames.AI_TASK_FAILED]: AiTaskFailedPayload
  [EventNames.ASR_FALLBACK]: AsrFallbackPayload
  [EventNames.ASR_ERROR]: { sessionId: string; error: string }
  [EventNames.INPUT_METHOD_ACTIVATED]: Record<string, never>
  [EventNames.INPUT_METHOD_TEXT_CHANGED]: TextPayload
  [EventNames.INPUT_METHOD_CONFIRMED]: TextPayload
  [EventNames.INPUT_METHOD_CANCELLED]: Record<string, never>
}

// ============================================================================
// 通用事件监听 Composable
// ============================================================================

/**
 * 后端 AppEvent 的格式
 * 
 * 后端使用 `#[serde(tag = "type", content = "payload")]` 序列化 AppEvent，
 * 所以 Tauri 收到的 event.payload 实际上是：
 * {
 *   "type": "transcriptPartial",
 *   "payload": { sessionId, text, ... }
 * }
 * 
 * 我们需要提取内部的 payload
 */
interface AppEventWrapper<T> {
  type: string
  payload: T
}

/**
 * 通用事件监听 Hook
 *
 * 自动在组件卸载时清理监听器
 */
export function useAppEvents() {
  const listeners = new Map<string, UnlistenFn>()

  /**
   * 监听事件
   */
  async function on<E extends EventName>(
    event: E,
    handler: (payload: EventPayloadMap[E]) => void
  ): Promise<void> {
    // 如果已有监听器，先取消
    const existing = listeners.get(event)
    if (existing) {
      existing()
    }

    // 后端发送的是完整的 AppEvent，格式为 { type: "xxx", payload: {...} }
    // 我们需要提取内部的 payload
    const unlisten = await listen<AppEventWrapper<EventPayloadMap[E]>>(event, (e) => {
      // 提取真正的 payload
      const actualPayload = e.payload.payload
      handler(actualPayload)
    })

    listeners.set(event, unlisten)
  }

  /**
   * 取消监听
   */
  function off(event: EventName): void {
    const unlisten = listeners.get(event)
    if (unlisten) {
      unlisten()
      listeners.delete(event)
    }
  }

  /**
   * 取消所有监听
   */
  function offAll(): void {
    listeners.forEach((unlisten) => unlisten())
    listeners.clear()
  }

  // 组件卸载时自动清理
  onUnmounted(() => {
    offAll()
  })

  return {
    on,
    off,
    offAll,
  }
}

// ============================================================================
// 转录事件 Composable
// ============================================================================

/**
 * 转录事件监听 Hook
 *
 * @param sessionId - 要监听的 Session ID
 */
export function useTranscriptEvents(sessionId: Ref<string | null>) {
  const { on, offAll } = useAppEvents()

  /** 临时转录文本 */
  const partialText = ref('')

  /** 已确认的转录分段 */
  const segments = ref<TranscriptSegment[]>([])

  /** 是否正在处理 */
  const isProcessing = ref(false)

  /**
   * 开始监听
   */
  async function startListening() {
    // 监听实时转录
    await on(EventNames.TRANSCRIPT_PARTIAL, (payload) => {
      if (sessionId.value && payload.sessionId === sessionId.value) {
        partialText.value = payload.text
        isProcessing.value = true
      }
    })

    // 监听最终转录
    await on(EventNames.TRANSCRIPT_FINAL, (payload) => {
      if (sessionId.value && payload.sessionId === sessionId.value) {
        segments.value.push(payload.segment)
        partialText.value = ''
        isProcessing.value = false
      }
    })
  }

  /**
   * 停止监听
   */
  function stopListening() {
    offAll()
  }

  /**
   * 重置状态
   */
  function reset() {
    partialText.value = ''
    segments.value = []
    isProcessing.value = false
  }

  return {
    partialText,
    segments,
    isProcessing,
    startListening,
    stopListening,
    reset,
  }
}

// ============================================================================
// 音频电平事件 Composable
// ============================================================================

/**
 * 音频电平监听 Hook
 *
 * @param sessionId - 要监听的 Session ID
 */
export function useAudioLevelEvents(sessionId: Ref<string | null>) {
  const { on, offAll } = useAppEvents()

  /** 当前音量电平 (0.0 - 1.0) */
  const level = ref(0)

  /** 分贝值 */
  const db = ref(-60)

  /** 是否正在说话 */
  const isSpeaking = ref(false)

  /**
   * 开始监听
   */
  async function startListening() {
    // 监听音频电平
    await on(EventNames.AUDIO_LEVEL, (payload) => {
      if (sessionId.value && payload.sessionId === sessionId.value) {
        level.value = payload.level
        db.value = payload.db
      }
    })

    // 监听语音活动
    await on(EventNames.VOICE_ACTIVITY, (payload) => {
      if (sessionId.value && payload.sessionId === sessionId.value) {
        isSpeaking.value = payload.isSpeaking
      }
    })
  }

  /**
   * 停止监听
   */
  function stopListening() {
    offAll()
  }

  return {
    level,
    db,
    isSpeaking,
    startListening,
    stopListening,
  }
}

// ============================================================================
// Session 事件 Composable
// ============================================================================

/**
 * Session 事件监听 Hook
 *
 * @param sessionId - 要监听的 Session ID
 */
export function useSessionEvents(sessionId: Ref<string | null>) {
  const { on, offAll } = useAppEvents()

  /** Session 状态 */
  const status = ref<'created' | 'recording' | 'paused' | 'completed' | 'error'>('created')

  /** 错误信息 */
  const error = ref<string | null>(null)

  /**
   * 开始监听
   */
  async function startListening() {
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

  /**
   * 停止监听
   */
  function stopListening() {
    offAll()
  }

  return {
    status,
    error,
    startListening,
    stopListening,
  }
}

// ============================================================================
// 麦克风事件 Composable
// ============================================================================

/**
 * 麦克风事件监听 Hook
 *
 * @param sessionId - 要监听的 Session ID
 */
export function useMicrophoneEvents(sessionId: Ref<string | null>) {
  const { on, offAll } = useAppEvents()

  /** 是否拥有麦克风 */
  const hasMicrophone = ref(false)

  /** 是否被抢占 */
  const wasPreempted = ref(false)

  /** 抢占者 ID */
  const preemptedBy = ref<string | null>(null)

  /**
   * 开始监听
   */
  async function startListening() {
    await on(EventNames.MICROPHONE_ACQUIRED, (payload) => {
      if (sessionId.value && payload.sessionId === sessionId.value) {
        hasMicrophone.value = true
        wasPreempted.value = false
        preemptedBy.value = null
      }
    })

    await on(EventNames.MICROPHONE_RELEASED, (payload) => {
      if (sessionId.value && payload.sessionId === sessionId.value) {
        hasMicrophone.value = false
      }
    })

    await on(EventNames.MICROPHONE_PREEMPTED, (payload) => {
      if (sessionId.value && payload.sessionId === sessionId.value) {
        hasMicrophone.value = false
        wasPreempted.value = true
        preemptedBy.value = payload.preemptedBy
      }
    })
  }

  /**
   * 停止监听
   */
  function stopListening() {
    offAll()
  }

  return {
    hasMicrophone,
    wasPreempted,
    preemptedBy,
    startListening,
    stopListening,
  }
}

// ============================================================================
// 一次性事件监听
// ============================================================================

/**
 * 监听一次性事件
 *
 * @param event - 事件名称
 * @param handler - 处理函数
 * @returns 取消监听函数
 */
export async function onceEvent<E extends EventName>(
  event: E,
  handler: (payload: EventPayloadMap[E]) => void
): Promise<UnlistenFn> {
  const unlisten = await listen<AppEventWrapper<EventPayloadMap[E]>>(event, (e) => {
    handler(e.payload.payload)
    unlisten()
  })
  return unlisten
}

/**
 * 等待事件
 *
 * @param event - 事件名称
 * @param timeout - 超时时间（毫秒）
 * @returns Promise 返回事件 Payload
 */
export function waitForEvent<E extends EventName>(
  event: E,
  timeout = 30000
): Promise<EventPayloadMap[E]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unlisten?.()
      reject(new Error(`等待事件 ${event} 超时`))
    }, timeout)

    let unlisten: UnlistenFn | undefined

    listen<AppEventWrapper<EventPayloadMap[E]>>(event, (e) => {
      clearTimeout(timer)
      unlisten?.()
      resolve(e.payload.payload)
    }).then((fn) => {
      unlisten = fn
    })
  })
}
