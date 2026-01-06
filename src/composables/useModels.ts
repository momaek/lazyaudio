import { ref, computed, onUnmounted } from 'vue'
import { listen } from '@tauri-apps/api/event'
import { commands, fromRustModelInfo, fromRustDownloadProgress } from '@/types'
import type { ModelInfo, ModelDownloadProgress } from '@/types'
import type { ModelDownloadProgress as RustModelDownloadProgress, ModelDownloadComplete } from '@/types/bindings'

/**
 * ASR 模型管理 Composable
 */
export function useModels() {
  // 状态
  const models = ref<ModelInfo[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  
  /** 下载进度 Map<modelId, progress> */
  const downloadProgress = ref<Map<string, ModelDownloadProgress>>(new Map())
  
  /** 当前下载中的模型 ID */
  const downloadingModelId = ref<string | null>(null)

  // 事件监听取消函数
  let unlistenProgress: (() => void) | null = null
  let unlistenComplete: (() => void) | null = null

  // 计算属性
  const hasAnyModel = computed(() => {
    return models.value.some(m => m.downloaded)
  })

  const downloadedModels = computed(() => {
    return models.value.filter(m => m.downloaded)
  })

  const availableModels = computed(() => {
    return models.value.filter(m => !m.downloaded)
  })

  const isDownloading = computed(() => {
    return downloadingModelId.value !== null
  })

  /**
   * 加载模型列表
   */
  async function loadModels(): Promise<void> {
    isLoading.value = true
    error.value = null

    try {
      const result = await commands.listAsrModels()
      if (result.status === 'ok') {
        models.value = result.data.map(fromRustModelInfo)
      } else {
        error.value = result.error
      }
    } catch (e) {
      console.error('[Models] 加载模型列表失败:', e)
      error.value = '加载失败'
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 下载模型
   */
  async function downloadModel(modelId: string): Promise<boolean> {
    if (downloadingModelId.value) {
      error.value = '已有模型正在下载中'
      return false
    }

    downloadingModelId.value = modelId
    error.value = null

    try {
      // 初始化进度
      downloadProgress.value.set(modelId, {
        model_id: modelId,
        current_file: '',
        downloaded_bytes: 0,
        total_bytes: 0,
        overall_progress: 0,
      })

      const result = await commands.downloadModel(modelId)
      if (result.status === 'ok') {
        // 刷新模型列表
        await loadModels()
        return true
      } else {
        error.value = result.error
        return false
      }
    } catch (e) {
      console.error('[Models] 下载模型失败:', e)
      error.value = '下载失败'
      return false
    } finally {
      downloadingModelId.value = null
      downloadProgress.value.delete(modelId)
    }
  }

  /**
   * 取消下载 (暂不支持)
   */
  async function cancelDownload(): Promise<void> {
    console.warn('[Models] 取消下载功能暂不支持')
  }

  /**
   * 删除模型 (暂不支持)
   */
  async function deleteModel(_modelId: string): Promise<boolean> {
    console.warn('[Models] 删除模型功能暂不支持')
    return false
  }

  /**
   * 获取模型下载进度
   */
  function getProgress(modelId: string): ModelDownloadProgress | undefined {
    return downloadProgress.value.get(modelId)
  }

  /**
   * 设置事件监听
   */
  async function setupListeners(): Promise<void> {
    // 监听下载进度
    unlistenProgress = await listen<RustModelDownloadProgress>(
      'model-download-progress',
      (event) => {
        const progress = fromRustDownloadProgress(event.payload)
        downloadProgress.value.set(progress.model_id, progress)
      }
    )

    // 监听下载完成
    unlistenComplete = await listen<ModelDownloadComplete>(
      'model-download-complete',
      async (event) => {
        const { modelId, success } = event.payload
        if (success) {
          await loadModels()
        }
        downloadProgress.value.delete(modelId)
        if (downloadingModelId.value === modelId) {
          downloadingModelId.value = null
        }
      }
    )
  }

  /**
   * 清理事件监听
   */
  function cleanupListeners(): void {
    unlistenProgress?.()
    unlistenComplete?.()
    unlistenProgress = null
    unlistenComplete = null
  }

  // 组件卸载时清理
  onUnmounted(() => {
    cleanupListeners()
  })

  return {
    // 状态
    models,
    isLoading,
    error,
    downloadProgress,
    downloadingModelId,
    // 计算属性
    hasAnyModel,
    downloadedModels,
    availableModels,
    isDownloading,
    // 方法
    loadModels,
    downloadModel,
    cancelDownload,
    deleteModel,
    getProgress,
    setupListeners,
    cleanupListeners,
  }
}
