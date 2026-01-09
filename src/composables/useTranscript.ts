/**
 * 转录 Composable
 *
 * 提供实时转录监听和历史转录加载功能
 * 基于时间窗口的原地替换策略（Stream → VAD → Tier2）
 */

import { ref, computed, onUnmounted, watch, type Ref } from 'vue'
import { commands, type TranscriptSegment } from '@/types/bindings'
import { EventNames, useAppEvents } from './useEvents'

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 带元数据的转录段落
 */
export interface SegmentWithMeta extends TranscriptSegment {
  tier: 'tier0' | 'tier1' | 'tier2'
  receivedAt: number  // 前端接收时间戳（performance.now()）
  clientId: string    // 前端稳定 ID，用于保持气泡 DOM 不重建
}

// ============================================================================
// 配置常量
// ============================================================================

/** 时间窗口重叠阈值（60%） */
const OVERLAP_THRESHOLD = 0.6

/** Tier 优先级 */
const TIER_PRIORITY = { tier0: 1, tier1: 2, tier2: 3 }

/** Partial 停止更新后自动固化的超时（ms） */
const PARTIAL_IDLE_TIMEOUT_MS = 1400

/** VAD 静默后自动固化的超时（ms） */
const SILENCE_FINALIZE_TIMEOUT_MS = 800

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 检查两个段落是否有足够的时间窗口重叠
 * 
 * @param seg1 - 第一个段落
 * @param seg2 - 第二个段落
 * @param threshold - 重叠阈值（0-1）
 * @returns 是否重叠
 */
function hasOverlap(
  seg1: { startTime: number; endTime: number },
  seg2: { startTime: number; endTime: number },
  threshold: number = OVERLAP_THRESHOLD
): boolean {
  const overlapStart = Math.max(seg1.startTime, seg2.startTime)
  const overlapEnd = Math.min(seg1.endTime, seg2.endTime)
  const overlapDuration = Math.max(0, overlapEnd - overlapStart)
  
  if (overlapDuration === 0) return false
  
  const seg1Duration = seg1.endTime - seg1.startTime
  const seg2Duration = seg2.endTime - seg2.startTime
  const minDuration = Math.min(seg1Duration, seg2Duration)
  
  if (minDuration === 0) return false
  
  return (overlapDuration / minDuration) >= threshold
}

/**
 * 生成前端稳定 ID
 */
function createClientId(): string {
  return `seg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

// ============================================================================
// useTranscript Composable
// ============================================================================

/**
 * 转录 Hook
 *
 * 监听 Session 的实时转录并管理转录内容
 * 实现基于时间窗口的原地替换策略
 *
 * @param sessionId - 要监听的 Session ID
 */
export function useTranscript(sessionId: Ref<string | null>) {
  const { on, offAll } = useAppEvents()

  // ============================================================================
  // 状态
  // ============================================================================
  
  /** 显示的段落列表（已固化的段落） */
  const displaySegments = ref<SegmentWithMeta[]>([])
  
  /** 活跃段落（当前正在说话的段落） */
  const activeSegment = ref<SegmentWithMeta | null>(null)

  /** 活跃段落的前端稳定 ID */
  const activeSegmentId = ref<string | null>(null)
  
  /** 活跃段落的临时文本（Partial 更新） */
  const activeSegmentPartialText = ref('')
  
  // 兼容性：保留 partialText 用于向后兼容
  const partialText = ref('')
  const isProcessing = ref(false)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  
  // 刚刚精修完成的段落 ID 集合（用于显示动画）
  const recentlyRefinedIds = ref<Set<string>>(new Set())

  // Partial/静默计时器
  let lastPartialAt = 0
  let partialFinalizeTimer: ReturnType<typeof setTimeout> | null = null
  let silenceFinalizeTimer: ReturnType<typeof setTimeout> | null = null

  // ============================================================================
  // 计算属性
  // ============================================================================
  
  /** 总字数 */
  const wordCount = computed(() => {
    return displaySegments.value.reduce((sum, s) => sum + s.text.length, 0)
  })

  /** 总字符数 */
  const characterCount = computed(() => {
    return displaySegments.value.reduce((sum, s) => sum + s.text.length, 0)
  })

  /** 总时长（秒） */
  const totalDuration = computed(() => {
    if (displaySegments.value.length === 0) return 0
    const lastSegment = displaySegments.value[displaySegments.value.length - 1]
    return lastSegment.endTime
  })

  /** 完整转录文本 */
  const fullText = computed(() => {
    return displaySegments.value.map((s) => s.text).join('')
  })

  /** 带临时结果的完整文本 */
  const fullTextWithPartial = computed(() => {
    if (activeSegmentId.value) {
      return fullText.value
    }
    return partialText.value ? fullText.value + partialText.value : fullText.value
  })

  // ============================================================================
  // 核心逻辑：时间窗口原地替换
  // ============================================================================

  /**
   * 处理新到达的段落
   * 
   * 策略：
   * 1. 查找时间窗口重叠的段落
   * 2. 如果找到 + 新 tier 更高 → 原地更新
   * 3. 如果找到 + 新 tier 更低 → 忽略（保留高优先级）
   * 4. 如果没找到 → 追加新段落
   */
  function handleIncomingSegment(newSegment: SegmentWithMeta) {
    const normalizedSegment = {
      ...newSegment,
      clientId: newSegment.clientId || newSegment.id || createClientId(),
    }

    // 1. 查找时间窗口重叠的段落
    let overlappingIndex = displaySegments.value.findIndex(
      (seg) => seg.id === normalizedSegment.id
    )
    if (overlappingIndex === -1) {
      overlappingIndex = displaySegments.value.findIndex((seg) =>
        hasOverlap(seg, normalizedSegment, OVERLAP_THRESHOLD)
      )
    }
    
    if (overlappingIndex !== -1) {
      const existing = displaySegments.value[overlappingIndex]
      const newPriority = TIER_PRIORITY[normalizedSegment.tier]
      const existingPriority = TIER_PRIORITY[existing.tier]
      
      if (newPriority > existingPriority) {
        // 2. 原地更新（保留 id，确保 Vue key 稳定）
        console.log(
          `🔄 [${normalizedSegment.startTime.toFixed(1)}s-${normalizedSegment.endTime.toFixed(1)}s] ` +
          `${existing.tier} → ${normalizedSegment.tier}: "${normalizedSegment.text.slice(0, 30)}..."`
        )
        
        displaySegments.value[overlappingIndex] = {
          ...existing,  // 保留 id 和原始 receivedAt
          text: normalizedSegment.text,
          tier: normalizedSegment.tier,
          confidence: normalizedSegment.confidence,
          source: normalizedSegment.source || existing.source,
          startTime: normalizedSegment.startTime,
          endTime: normalizedSegment.endTime,
        }
        
        // Tier2 精修完成动画
        if (normalizedSegment.tier === 'tier2') {
          recentlyRefinedIds.value.add(existing.clientId)
          setTimeout(() => {
            recentlyRefinedIds.value.delete(existing.clientId)
          }, 500)
        }
      } else {
        console.log(
          `⏭️ 保留高优先级: ${existing.tier} (${existingPriority}) > ` +
          `${normalizedSegment.tier} (${newPriority})`
        )
      }
    } else {
      // 3. 追加新段落
      console.log(
        `➕ [${normalizedSegment.startTime.toFixed(1)}s-${normalizedSegment.endTime.toFixed(1)}s] ` +
        `新增 ${normalizedSegment.tier}: "${normalizedSegment.text.slice(0, 30)}..."`
      )
      displaySegments.value.push(normalizedSegment)
      
      // 按时间排序
      displaySegments.value.sort((a, b) => a.startTime - b.startTime)
    }
  }

  /**
   * 获取活跃段落索引
   */
  function getActiveIndex(): number {
    if (!activeSegmentId.value) return -1
    return displaySegments.value.findIndex(s => s.clientId === activeSegmentId.value)
  }

  /**
   * 确保存在一个活跃段落，并返回其索引
   */
  function ensureActiveSegment(): number {
    const existingIndex = getActiveIndex()
    if (existingIndex !== -1) return existingIndex

    const clientId = createClientId()
    const lastEndTime = displaySegments.value.length > 0
      ? displaySegments.value[displaySegments.value.length - 1].endTime
      : 0
    const nowIso = new Date().toISOString()
    const newSegment: SegmentWithMeta = {
      id: clientId,
      clientId,
      text: '',
      tier: 'tier0',
      startTime: lastEndTime,
      endTime: lastEndTime,
      isFinal: false,
      confidence: null,
      source: null,
      language: null,
      words: null,
      createdAt: nowIso,
      receivedAt: performance.now(),
    }

    displaySegments.value.push(newSegment)
    activeSegmentId.value = clientId
    return displaySegments.value.length - 1
  }

  /**
   * 清理固化计时器
   */
  function clearFinalizeTimers(): void {
    if (partialFinalizeTimer) {
      clearTimeout(partialFinalizeTimer)
      partialFinalizeTimer = null
    }
    if (silenceFinalizeTimer) {
      clearTimeout(silenceFinalizeTimer)
      silenceFinalizeTimer = null
    }
  }

  /**
   * 安排 Partial 固化
   */
  function schedulePartialFinalize(): void {
    if (partialFinalizeTimer) {
      clearTimeout(partialFinalizeTimer)
    }
    partialFinalizeTimer = setTimeout(() => {
      if (!activeSegmentId.value) return
      const idleFor = Date.now() - lastPartialAt
      if (idleFor >= PARTIAL_IDLE_TIMEOUT_MS) {
        finalizeActiveSegment()
      }
    }, PARTIAL_IDLE_TIMEOUT_MS)
  }

  /**
   * 安排静默固化
   */
  function scheduleSilenceFinalize(): void {
    if (silenceFinalizeTimer) {
      clearTimeout(silenceFinalizeTimer)
    }
    silenceFinalizeTimer = setTimeout(() => {
      if (activeSegmentId.value) {
        if (Date.now() - lastPartialAt < SILENCE_FINALIZE_TIMEOUT_MS) {
          return
        }
        finalizeActiveSegment()
      }
    }, SILENCE_FINALIZE_TIMEOUT_MS)
  }

  /**
   * 固化当前活跃段落（仅改变活跃态，不销毁）
   */
  function finalizeActiveSegment(): void {
    if (!activeSegmentId.value) return
    activeSegmentId.value = null
    activeSegment.value = null
    activeSegmentPartialText.value = ''
    partialText.value = ''
    isProcessing.value = false
    clearFinalizeTimers()
  }

  // ============================================================================
  // 事件监听
  // ============================================================================

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
        // 历史转录直接加载到 displaySegments
        displaySegments.value = result.data.map(seg => ({
          ...seg,
          tier: (seg.tier as any) || 'tier1',
          receivedAt: performance.now(),
          clientId: seg.id,
        }))
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
    // 监听 Partial（临时结果）
    await on(EventNames.TRANSCRIPT_PARTIAL, (payload) => {
      if (sessionId.value && payload.sessionId === sessionId.value) {
        // 如果没有活跃段落，创建一个新的
        const index = ensureActiveSegment()

        displaySegments.value[index] = {
          ...displaySegments.value[index],
          text: payload.text,
          confidence: payload.confidence ?? displaySegments.value[index].confidence,
          tier: 'tier0',
        }

        // 同步活跃段落引用
        activeSegment.value = displaySegments.value[index]

        // 更新活跃段落的临时文本
        activeSegmentPartialText.value = payload.text
        
        // 兼容性：同时更新 partialText
        partialText.value = payload.text
        isProcessing.value = true
        lastPartialAt = Date.now()
        if (silenceFinalizeTimer) {
          clearTimeout(silenceFinalizeTimer)
          silenceFinalizeTimer = null
        }
        schedulePartialFinalize()
      }
    })

    // 监听 TranscriptFinal (tier0/tier1)
    await on(EventNames.TRANSCRIPT_FINAL, (payload) => {
      if (!sessionId.value || payload.sessionId !== sessionId.value) return
      
      const segment: SegmentWithMeta = {
        ...payload.segment,
        tier: (payload.segment.tier as any) || 'tier0',
        receivedAt: performance.now(),
        clientId: activeSegmentId.value || createClientId(),
      }
      
      console.log(`📝 收到 ${segment.tier}: [${segment.startTime.toFixed(1)}s-${segment.endTime.toFixed(1)}s]`)

      const activeIndex = getActiveIndex()
      if (activeIndex !== -1) {
        const existing = displaySegments.value[activeIndex]
        displaySegments.value[activeIndex] = {
          ...existing,
          ...segment,
          id: segment.id,
          clientId: existing.clientId,
        }
        activeSegment.value = displaySegments.value[activeIndex]
        finalizeActiveSegment()
      } else {
        // 固化到 displaySegments（回退）
        handleIncomingSegment({
          ...segment,
          clientId: createClientId(),
        })
        finalizeActiveSegment()
      }
    })
    
    // 监听 TranscriptUpdated (Tier2)
    await on(EventNames.TRANSCRIPT_UPDATED, (payload) => {
      if (!sessionId.value || payload.sessionId !== sessionId.value) return
      
      console.log(`🔄 收到 Tier2 精修: ${payload.segmentId}`)
      
      // 1. 优先用 segmentId 精确匹配
      let index = displaySegments.value.findIndex(s => s.id === payload.segmentId)
      
      if (index === -1) {
        // 2. 回退到时间窗口匹配
        console.log(`⚠️ segmentId 未匹配，尝试时间窗口匹配`)
        index = displaySegments.value.findIndex(s =>
          hasOverlap(s, payload.segment, OVERLAP_THRESHOLD)
        )
      }
      
      if (index !== -1) {
        console.log(
          `✅ Tier2 精修: ${displaySegments.value[index].tier} → tier2 ` +
          `"${displaySegments.value[index].text.slice(0, 20)}..." → ` +
          `"${payload.text.slice(0, 20)}..."`
        )
        
        displaySegments.value[index] = {
          ...displaySegments.value[index],
          text: payload.text,
          tier: 'tier2',
          confidence: payload.confidence,
        }
        
        // 触发动画
        recentlyRefinedIds.value.add(displaySegments.value[index].clientId)
        setTimeout(() => {
          recentlyRefinedIds.value.delete(displaySegments.value[index].clientId)
        }, 500)
      } else {
        console.warn('⚠️ Tier2 未找到对应段落，作为新段落追加')
        handleIncomingSegment({
          ...payload.segment,
          tier: 'tier2',
          receivedAt: performance.now(),
          clientId: createClientId(),
        })
      }
    })

    // 监听语音活动（用于静默固化）
    await on(EventNames.VOICE_ACTIVITY, (payload) => {
      if (!sessionId.value || payload.sessionId !== sessionId.value) return
      if (payload.isSpeaking) {
        if (silenceFinalizeTimer) {
          clearTimeout(silenceFinalizeTimer)
          silenceFinalizeTimer = null
        }
        return
      }
      scheduleSilenceFinalize()
    })
  }

  /**
   * 停止监听
   */
  function stopListening(): void {
    offAll()
    clearFinalizeTimers()
  }

  /**
   * 重置状态
   */
  function reset(): void {
    displaySegments.value = []
    activeSegment.value = null
    activeSegmentId.value = null
    activeSegmentPartialText.value = ''
    partialText.value = ''
    isProcessing.value = false
    error.value = null
    recentlyRefinedIds.value.clear()
    clearFinalizeTimers()
  }

  /**
   * 追加分段（兼容性方法）
   */
  function appendSegment(segment: TranscriptSegment): void {
    const segmentWithMeta: SegmentWithMeta = {
      ...segment,
      tier: (segment.tier as any) || 'tier1',
      receivedAt: performance.now(),
      clientId: segment.id || createClientId(),
    }
    handleIncomingSegment(segmentWithMeta)
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
    // 显示数据
    segments: displaySegments,  // 兼容性：原来的 segments 现在直接返回 displaySegments
    displaySegments,
    activeSegment,
    activeSegmentId,
    activeSegmentPartialText,
    partialText,  // 兼容性：保留
    isProcessing,
    isLoading,
    error,
    recentlyRefinedIds,
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
