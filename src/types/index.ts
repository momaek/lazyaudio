// 类型导出入口文件
// 从 Rust 生成的 bindings 导出所有类型

export * from './bindings'

// 类型别名，方便使用
import type {
  PermissionType as RustPermissionType,
  PermissionStatus as RustPermissionStatus,
  ModelInfo as RustModelInfo,
  ModelDownloadProgress as RustModelDownloadProgress,
} from './bindings'

// 权限类型别名
export type PermissionType = 'ScreenCapture' | 'Microphone' | 'Accessibility'

// 将前端使用的权限类型映射到 Rust 类型
export function toRustPermissionType(type: PermissionType): RustPermissionType {
  switch (type) {
    case 'ScreenCapture':
      return 'systemAudioRecording'
    case 'Microphone':
      return 'microphone'
    case 'Accessibility':
      return 'accessibility'
  }
}

// 权限状态类型别名
export type PermissionStatus = 'Granted' | 'Denied' | 'NotDetermined' | 'Restricted' | 'NotApplicable'

// 将 Rust 权限状态映射到前端类型
export function fromRustPermissionStatus(status: RustPermissionStatus): PermissionStatus {
  switch (status) {
    case 'granted':
      return 'Granted'
    case 'denied':
      return 'Denied'
    case 'notDetermined':
      return 'NotDetermined'
    case 'restricted':
      return 'Restricted'
    case 'notApplicable':
      return 'NotApplicable'
  }
}

// 权限信息
export interface PermissionInfo {
  status: PermissionStatus
  description?: string
}

// 模型类型
export type ModelType = 'streaming' | 'non_streaming'

// 模型信息别名
export interface ModelInfo {
  id: string
  name: string
  description: string
  size: number // 字节，0 表示未知
  downloaded: boolean
  modelType: ModelType
}

// 从 Rust 模型信息转换
export function fromRustModelInfo(model: RustModelInfo): ModelInfo {
  return {
    id: model.id,
    name: model.name,
    description: model.description ?? '',
    size: model.size_mb * 1024 * 1024, // 转换为字节
    downloaded: model.is_downloaded,
    modelType: model.model_type,
  }
}

// 模型下载进度
export interface ModelDownloadProgress {
  model_id: string
  current_file: string
  downloaded_bytes: number
  total_bytes: number
  overall_progress: number
}

// 从 Rust 下载进度转换
export function fromRustDownloadProgress(progress: RustModelDownloadProgress): ModelDownloadProgress {
  return {
    model_id: progress.modelId,
    current_file: '',
    downloaded_bytes: progress.downloaded,
    total_bytes: progress.total,
    overall_progress: progress.progress,
  }
}

// ASR 识别结果
export interface AsrResult {
  text: string
  timestamp: number
  is_final?: boolean
  confidence?: number
}
