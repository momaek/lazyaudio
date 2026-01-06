/**
 * 转录 Composable
 *
 * 提供实时转录监听和历史转录加载功能
 */

import { ref, computed, onUnmounted, watch, type Ref } from 'vue'
import { commands, type TranscriptSegment } from '@/types/bindings'
import { EventNames, useAppEvents } from './useEvents'

// ============================================================================
// useTranscript Composable
// ============================================================================

/**
 * 转录 Hook
 *
 * 监听 Session 的实时转录并管理转录内容
 *
 * @param sessionId - 要监听的 Session ID
 */
export function useTranscript(sessionId: Ref<string | null>) {
  const { on, offAll } = useAppEvents()

  // 状态
  const segments = ref<TranscriptSegment[]>([])
  const partialText = ref('')
  const isProcessing = ref(false)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // 计算属性
  /** 总字数 */
  const wordCount = computed(() => {
    return segments.value.reduce((sum, s) => sum + s.text.length, 0)
  })

  /** 总字符数 */
  const characterCount = computed(() => {
    return segments.value.reduce((sum, s) => sum + s.text.length, 0)
  })

  /** 总时长（秒） */
  const totalDuration = computed(() => {
    if (segments.value.length === 0) return 0
    const lastSegment = segments.value[segments.value.length - 1]
    return lastSegment.endTime
  })

  /** 完整转录文本 */
  const fullText = computed(() => {
    return segments.value.map((s) => s.text).join('')
  })

  /** 带临时结果的完整文本 */
  const fullTextWithPartial = computed(() => {
    const base = fullText.value
    if (partialText.value) {
      return base + partialText.value
    }
    return base
  })

  /**
   * 加载历史转录
   */
  async function loadTranscript(): Promise<void> {
    if (!sessionId.value) return

    isLoading.value = true
    error.value = null

    try {
      const result = await commands.getTranscript(sessionId.value)
      if (result.status === 'ok') {
        segments.value = result.data
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
   * 开始监听实时转录
   */
  async function startListening(): Promise<void> {
    // 监听实时转录
    await on(EventNames.TRANSCRIPT_PARTIAL, (payload) => {
      if (sessionId.value && payload.sessionId === sessionId.value) {
        partialText.value = payload.text
        isProcessing.value = true
      }
    })

    // 监听最终转录（Tier 1）
    await on(EventNames.TRANSCRIPT_FINAL, (payload) => {
      if (sessionId.value && payload.sessionId === sessionId.value) {
        segments.value.push(payload.segment)
        partialText.value = ''
        isProcessing.value = false
      }
    })

    // 监听转录更新（Tier 2 multi-pass）
    await on(EventNames.TRANSCRIPT_UPDATED, (payload) => {
      if (sessionId.value && payload.sessionId === sessionId.value) {
        // 根据 segmentId 找到对应段落并更新
        const index = segments.value.findIndex((s) => s.id === payload.segmentId)
        if (index !== -1) {
          const existingSegment = segments.value[index]
          // 覆盖更新段落（如果 payload.text 为空，保留原有文本）
          segments.value[index] = {
            ...existingSegment,
            text: payload.text || existingSegment.text,
            confidence: payload.confidence || existingSegment.confidence,
            tier: payload.tier as 'tier1' | 'tier2' | undefined,
          }
          console.log(`✅ Multi-pass 更新 (${payload.tier}): ${payload.segmentId}`, segments.value[index].text)
        } else {
          console.warn(`⚠️ Multi-pass 更新: 未找到段落 ${payload.segmentId}`)
        }
      }
    })
  }

  /**
   * 停止监听
   */
  function stopListening(): void {
    offAll()
  }

  /**
   * 重置状态
   */
  function reset(): void {
    segments.value = []
    partialText.value = ''
    isProcessing.value = false
    error.value = null
  }

  /**
   * 追加分段
   */
  function appendSegment(segment: TranscriptSegment): void {
    segments.value.push(segment)
    partialText.value = ''
    isProcessing.value = false
  }

  // 监听 sessionId 变化
  watch(sessionId, (newId, oldId) => {
    if (newId !== oldId) {
      reset()
      if (newId) {
        loadTranscript()
      }
    }
  })

  // 组件卸载时清理
  onUnmounted(() => {
    stopListening()
  })

  return {
    // 状态
    segments,
    partialText,
    isProcessing,
    isLoading,
    error,
    // 计算属性
    wordCount,
    characterCount,
    totalDuration,
    fullText,
    fullTextWithPartial,
    // 方法
    loadTranscript,
    startListening,
    stopListening,
    reset,
    appendSegment,
  }
}

// ============================================================================
// useTranscriptDisplay Composable
// ============================================================================

/**
 * 转录显示 Hook
 *
 * 提供转录文本的格式化和显示功能
 */
export function useTranscriptDisplay(segments: Ref<TranscriptSegment[]>) {
  /**
   * 格式化时间戳
   */
  function formatTimestamp(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  /**
   * 按时间间隔分组
   *
   * @param maxGap - 最大间隔（秒），超过则分组
   */
  function groupByTimeGap(maxGap = 2): TranscriptSegment[][] {
    const groups: TranscriptSegment[][] = []
    let currentGroup: TranscriptSegment[] = []

    for (const segment of segments.value) {
      if (currentGroup.length === 0) {
        currentGroup.push(segment)
      } else {
        const lastSegment = currentGroup[currentGroup.length - 1]
        const gap = segment.startTime - lastSegment.endTime
        if (gap > maxGap) {
          groups.push(currentGroup)
          currentGroup = [segment]
        } else {
          currentGroup.push(segment)
        }
      }
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup)
    }

    return groups
  }

  /**
   * 按来源分组
   */
  function groupBySource(): Record<string, TranscriptSegment[]> {
    const groups: Record<string, TranscriptSegment[]> = {}

    for (const segment of segments.value) {
      const source = segment.source ?? 'unknown'
      if (!groups[source]) {
        groups[source] = []
      }
      groups[source].push(segment)
    }

    return groups
  }

  /**
   * 获取格式化的转录文本
   *
   * @param includeTimestamp - 是否包含时间戳
   */
  function getFormattedText(includeTimestamp = false): string {
    return segments.value
      .map((s) => {
        if (includeTimestamp) {
          return `[${formatTimestamp(s.startTime)}] ${s.text}`
        }
        return s.text
      })
      .join('\n')
  }

  /**
   * 导出为 SRT 格式
   */
  function exportAsSrt(): string {
    return segments.value
      .map((s, index) => {
        const startTime = formatSrtTime(s.startTime)
        const endTime = formatSrtTime(s.endTime)
        return `${index + 1}\n${startTime} --> ${endTime}\n${s.text}\n`
      })
      .join('\n')
  }

  /**
   * 格式化 SRT 时间
   */
  function formatSrtTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 1000)
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`
  }

  return {
    formatTimestamp,
    groupByTimeGap,
    groupBySource,
    getFormattedText,
    exportAsSrt,
    formatSrtTime,
  }
}

