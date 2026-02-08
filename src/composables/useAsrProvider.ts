/**
 * ASR Provider Composable
 *
 * 提供 Provider 连接测试、显示信息和可用列表
 */

import { ref, computed } from 'vue'
import { commands } from '@/types'
import { EventNames, useAppEvents } from '@/composables/useEvents'
import { toast } from '@/components/ui/toast'
import type { AsrProviderType } from '@/types/bindings'

/**
 * Provider 显示信息
 */
export interface ProviderInfo {
  type: AsrProviderType
  name: string
  description: string
  icon: string
  isLocal: boolean
  supportsStreaming: boolean
}

/**
 * 所有可用的 ASR Provider 信息
 */
export const ASR_PROVIDERS: ProviderInfo[] = [
  {
    type: 'local',
    name: '本地模型',
    description: '离线处理，数据不离开设备',
    icon: 'memory',
    isLocal: true,
    supportsStreaming: true,
  },
  {
    type: 'openai_whisper',
    name: 'OpenAI Whisper',
    description: '高精度，支持多语言，批量模式',
    icon: 'cloud',
    isLocal: false,
    supportsStreaming: false,
  },
  {
    type: 'deepgram',
    name: 'Deepgram',
    description: '实时流式转录，超低延迟',
    icon: 'stream',
    isLocal: false,
    supportsStreaming: true,
  },
]

/**
 * 获取 Provider 显示名称
 */
export function getProviderDisplayName(provider: AsrProviderType): string {
  const info = ASR_PROVIDERS.find((p) => p.type === provider)
  return info?.name ?? provider
}

/**
 * 获取 Provider 图标名称
 */
export function getProviderIcon(provider: AsrProviderType): string {
  const info = ASR_PROVIDERS.find((p) => p.type === provider)
  return info?.icon ?? 'help'
}

/**
 * 判断 Provider 是否为本地
 */
export function isLocalProvider(provider: AsrProviderType): boolean {
  return provider === 'local'
}

/**
 * ASR Provider Hook
 *
 * 提供连接测试功能
 */
export function useAsrProvider() {
  const isTesting = ref(false)
  const testResult = ref<{ success: boolean; message: string } | null>(null)

  /**
   * 测试 Provider 连接
   */
  async function testConnection(provider: AsrProviderType): Promise<boolean> {
    isTesting.value = true
    testResult.value = null

    try {
      const result = await commands.testAsrProvider(provider)
      if (result.status === 'ok' && result.data) {
        testResult.value = { success: true, message: '连接成功' }
        return true
      } else {
        testResult.value = {
          success: false,
          message: result.status === 'error' ? result.error : '连接失败',
        }
        return false
      }
    } catch (error) {
      testResult.value = {
        success: false,
        message: error instanceof Error ? error.message : '未知错误',
      }
      return false
    } finally {
      isTesting.value = false
    }
  }

  /**
   * 检查 ASR 是否就绪
   */
  async function checkAsrReady(): Promise<boolean> {
    try {
      const result = await commands.isAsrReady()
      return result.status === 'ok' && result.data === true
    } catch {
      return false
    }
  }

  /**
   * 获取可用 Provider 列表
   */
  const providers = computed(() => ASR_PROVIDERS)

  return {
    providers,
    isTesting,
    testResult,
    testConnection,
    checkAsrReady,
  }
}

/**
 * ASR 降级通知 Hook
 *
 * 在 App 级别调用，全局监听 asr:fallback 事件并弹出 toast 通知
 */
export function useAsrFallbackNotification() {
  const { on } = useAppEvents()
  /** 是否处于降级状态 */
  const isFallback = ref(false)
  /** 原始 Provider */
  const fallbackFromProvider = ref<AsrProviderType | null>(null)

  async function startListening() {
    await on(EventNames.ASR_FALLBACK, (payload) => {
      isFallback.value = true
      fallbackFromProvider.value = payload.fromProvider

      const fromName = getProviderDisplayName(payload.fromProvider)
      const toName = getProviderDisplayName(payload.toProvider)

      toast({
        title: '转录引擎已降级',
        description: `${fromName} 暂时不可用，已切换到 ${toName}。原因：${payload.reason}`,
        variant: 'destructive',
      })
    })
  }

  return {
    isFallback,
    fallbackFromProvider,
    startListening,
  }
}
