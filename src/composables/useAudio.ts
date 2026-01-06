/**
 * 音频 Composable
 *
 * 提供音频源列表查询和音频电平监听功能
 */

import { ref, onMounted, onUnmounted } from 'vue'
import { commands, events, type AudioSource } from '@/types/bindings'

// ============================================================================
// useAudioSources Composable
// ============================================================================

/**
 * 音频源列表 Hook
 *
 * 获取可用的系统音频源和麦克风设备
 */
export function useAudioSources() {
  // 状态
  const audioSources = ref<AudioSource[]>([])
  const microphones = ref<AudioSource[]>([])
  const systemSources = ref<AudioSource[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // 计算属性
  const defaultMicrophone = () => microphones.value.find((m) => m.is_default) ?? microphones.value[0]
  const defaultSystemSource = () => systemSources.value.find((s) => s.is_default) ?? systemSources.value[0]

  /**
   * 刷新所有音频源
   */
  async function refreshSources(): Promise<void> {
    isLoading.value = true
    error.value = null

    try {
      // 并行获取麦克风和系统音频源
      const [micResult, systemResult] = await Promise.all([
        commands.listMicrophones(),
        commands.listSystemAudioSources(),
      ])

      if (micResult.status === 'ok') {
        microphones.value = micResult.data
      } else {
        console.error('[useAudioSources] 获取麦克风列表失败:', micResult.error)
      }

      if (systemResult.status === 'ok') {
        systemSources.value = systemResult.data
      } else {
        console.error('[useAudioSources] 获取系统音频源失败:', systemResult.error)
      }

      // 合并所有音频源
      audioSources.value = [...microphones.value, ...systemSources.value]
    } catch (e) {
      error.value = String(e)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 刷新麦克风列表
   */
  async function refreshMicrophones(): Promise<void> {
    try {
      const result = await commands.listMicrophones()
      if (result.status === 'ok') {
        microphones.value = result.data
      }
    } catch (e) {
      console.error('[useAudioSources] 刷新麦克风列表失败:', e)
    }
  }

  /**
   * 刷新系统音频源列表（使用缓存）
   */
  async function refreshSystemSources(): Promise<void> {
    try {
      const result = await commands.listSystemAudioSources()
      if (result.status === 'ok') {
        systemSources.value = result.data
      }
    } catch (e) {
      console.error('[useAudioSources] 刷新系统音频源失败:', e)
    }
  }

  /**
   * 强制刷新系统音频源列表（忽略缓存）
   */
  async function forceRefreshSystemSources(): Promise<void> {
    isLoading.value = true
    try {
      const result = await commands.refreshSystemAudioSources()
      if (result.status === 'ok') {
        systemSources.value = result.data
        // 更新合并列表
        audioSources.value = [...microphones.value, ...systemSources.value]
      } else {
        console.error('[useAudioSources] 强制刷新系统音频源失败:', result.error)
      }
    } catch (e) {
      console.error('[useAudioSources] 强制刷新系统音频源失败:', e)
    } finally {
      isLoading.value = false
    }
  }

  // 组件挂载时自动加载
  onMounted(() => {
    refreshSources()
  })

  return {
    // 状态
    audioSources,
    microphones,
    systemSources,
    isLoading,
    error,
    // 方法
    defaultMicrophone,
    defaultSystemSource,
    refreshSources,
    refreshMicrophones,
    refreshSystemSources,
    forceRefreshSystemSources,
  }
}

// ============================================================================
// useAudioLevel Composable
// ============================================================================

/**
 * 音频电平监听 Hook
 *
 * 监听音频测试事件获取实时电平
 */
export function useAudioLevel() {
  // 状态
  const micLevel = ref(0)
  const micPeak = ref(0)
  const systemLevel = ref(0)
  const systemPeak = ref(0)
  const samples = ref(0)
  const durationMs = ref(0)

  let unlisten: (() => void) | null = null

  /**
   * 开始监听
   */
  async function startListening(): Promise<void> {
    // 先停止之前的监听
    stopListening()

    unlisten = await events.audioLevelEvent.listen((event) => {
      const data = event.payload
      micLevel.value = data.micLevel
      micPeak.value = data.micPeak
      systemLevel.value = data.systemLevel
      systemPeak.value = data.systemPeak
      samples.value = data.samples
      durationMs.value = data.durationMs
    })
  }

  /**
   * 停止监听
   */
  function stopListening(): void {
    if (unlisten) {
      unlisten()
      unlisten = null
    }
  }

  /**
   * 重置电平值
   */
  function reset(): void {
    micLevel.value = 0
    micPeak.value = 0
    systemLevel.value = 0
    systemPeak.value = 0
    samples.value = 0
    durationMs.value = 0
  }

  // 组件卸载时停止监听
  onUnmounted(() => {
    stopListening()
  })

  return {
    // 状态
    micLevel,
    micPeak,
    systemLevel,
    systemPeak,
    samples,
    durationMs,
    // 方法
    startListening,
    stopListening,
    reset,
  }
}

// ============================================================================
// useAudioTest Composable
// ============================================================================

/**
 * 音频测试 Hook
 *
 * 提供完整的音频测试功能
 */
export function useAudioTest() {
  const { micLevel, micPeak, systemLevel, systemPeak, samples, durationMs, startListening, stopListening, reset } =
    useAudioLevel()

  // 状态
  const isRunning = ref(false)
  const error = ref<string | null>(null)
  const micRecordingPath = ref<string | null>(null)
  const systemRecordingPath = ref<string | null>(null)

  /**
   * 开始测试
   */
  async function startTest(
    micId: string,
    systemSourceId?: string,
    enableRecording = false
  ): Promise<boolean> {
    if (isRunning.value) return false

    error.value = null
    reset()

    try {
      // 先开始监听事件
      await startListening()

      // 启动音频测试
      const result = await commands.startAudioTest(micId, systemSourceId ?? null, enableRecording)
      if (result.status === 'ok') {
        isRunning.value = true
        micRecordingPath.value = result.data.micRecordingPath
        systemRecordingPath.value = result.data.systemRecordingPath
        return true
      } else {
        error.value = result.error
        stopListening()
        return false
      }
    } catch (e) {
      error.value = String(e)
      stopListening()
      return false
    }
  }

  /**
   * 停止测试
   */
  async function stopTest(): Promise<boolean> {
    if (!isRunning.value) return false

    try {
      const result = await commands.stopAudioTest()
      if (result.status === 'ok') {
        isRunning.value = false
        stopListening()
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

  // 组件卸载时停止测试
  onUnmounted(() => {
    if (isRunning.value) {
      stopTest()
    }
  })

  return {
    // 状态
    isRunning,
    error,
    micRecordingPath,
    systemRecordingPath,
    // 电平
    micLevel,
    micPeak,
    systemLevel,
    systemPeak,
    samples,
    durationMs,
    // 方法
    startTest,
    stopTest,
  }
}

