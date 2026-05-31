// T31 — 内置模型 registry。
//
// 编译进 bundle,**不可远程更新**(避免供应链风险,见 transcription-pipeline.md §5.1)。
// sha256 / bytes / sources 均为真实可下载值(2026-05-30 实测):
//   模型 = sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09(官方文档推荐 int8 版)
//   csukuangfj = sherpa-onnx maintainer,HF repo 即官方源。
//   单文件源:hf-mirror(国内)+ huggingface(海外);均走 HF xet/cas、支持 Range。
//   GitHub releases 只发 .tar.bz2 整包(无单文件 URL)、ModelScope 无此 repo → 本轮不接。
//
// sources 里的 `{file}` 占位符在下载时按 file.relPath 替换。

export interface ModelFile {
  relPath: string
  sha256: string
  bytes: number
}

export interface ModelEntry {
  key: string
  kind: 'asr' | 'vad'
  displayName: string
  /** UI 简短描述 */
  description: string
  /** 语言 chip 文案 */
  lang: string
  version: string
  /** 所有文件字节和(= 占用磁盘 / 下载总量) */
  sizeBytes: number
  files: ModelFile[]
  /** 单文件源模板,含 `{file}` 占位符;顺序 = 默认源顺序(国内优先) */
  sources: string[]
  isDefault: boolean
}

const SENSE_VOICE_KEY = 'sense-voice-zh-en-ja-ko-yue-int8-2025-09-09'

export const MODELS: Record<string, ModelEntry> = {
  [SENSE_VOICE_KEY]: {
    key: SENSE_VOICE_KEY,
    kind: 'asr',
    displayName: 'SenseVoice-small (int8)',
    description: '中英日韩粤通用 · int8 量化 · 离线可用,数据不出本机',
    lang: 'zh',
    version: '2025-09-09',
    sizeBytes: 237_115_547 + 315_894,
    files: [
      {
        relPath: 'model.int8.onnx',
        sha256: '12ca1a2ae7ecf3e0019ef2822307ee0b5cadc9196569e379b4c4026f8205276d',
        bytes: 237_115_547,
      },
      {
        relPath: 'tokens.txt',
        sha256: 'f449eb28dc567533d7fa59be34e2abca8784f771850c78a47fb731a31429a1dc',
        bytes: 315_894,
      },
    ],
    sources: [
      'https://hf-mirror.com/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09/resolve/main/{file}',
      'https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09/resolve/main/{file}',
    ],
    isDefault: true,
  },
  'silero-vad-v5': {
    key: 'silero-vad-v5',
    kind: 'vad',
    displayName: 'Silero VAD v5',
    description: '语音活动检测 · 实时字幕分段依赖',
    lang: 'vad',
    version: 'v5',
    sizeBytes: 643_854,
    files: [
      {
        relPath: 'silero_vad.onnx',
        sha256: '9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6',
        bytes: 643_854,
      },
    ],
    // 无干净 HF 单文件镜像;github releases 单文件(643KB,国内可达性 OK)
    sources: ['https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/{file}'],
    isDefault: true,
  },
}

export const SILERO_VAD_KEY = 'silero-vad-v5'

export function getModelEntry(key: string): ModelEntry | undefined {
  return MODELS[key]
}

export function listModelEntries(): ModelEntry[] {
  return Object.values(MODELS)
}

/** 把 source 模板里的 `{file}` 换成具体文件相对路径 */
export function resolveSourceUrl(sourceTemplate: string, relPath: string): string {
  return sourceTemplate.replace('{file}', relPath)
}
