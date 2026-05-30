// T31 — 模型下载 IPC schema(运行时校验)。
// channel 名在 ./channels.ts(MODEL),纯字符串;这里是 zod schema,只在 main / renderer 业务层引。
// 事件 payload 对齐 transcription-pipeline.md §5.6。

import { z } from 'zod'
import { MODEL as CHANNEL } from './channels'

export { CHANNEL }

export const ModelKind = z.enum(['asr', 'vad'])
export type ModelKind = z.infer<typeof ModelKind>

/** 磁盘视角下模型的可见状态:可下载 / 下载中 / 已下载 */
export const ModelStatus = z.enum(['available', 'downloading', 'downloaded'])
export type ModelStatus = z.infer<typeof ModelStatus>

/** 给 UI 列表用的单条模型(不含 sources / sha256 等 main-only 字段) */
export const ModelListEntry = z.object({
  key: z.string(),
  displayName: z.string(),
  description: z.string(),
  /** 语言 chip 文案,如 'zh' / 'multi' */
  lang: z.string(),
  version: z.string(),
  kind: ModelKind,
  sizeBytes: z.number().int().nonnegative(),
  isDefault: z.boolean(),
  status: ModelStatus,
  /** 仅 status==='downloading' 时有:已下载字节(跨文件累计) */
  downloadedBytes: z.number().int().nonnegative().optional(),
})
export type ModelListEntry = z.infer<typeof ModelListEntry>

export const ListArgs = z.object({}).optional()
export type ListArgs = z.infer<typeof ListArgs>

export const ListResult = z.object({
  models: z.array(ModelListEntry),
})
export type ListResult = z.infer<typeof ListResult>

export const DownloadArgs = z.object({ modelKey: z.string() })
export type DownloadArgs = z.infer<typeof DownloadArgs>

/** download 是异步的:handle 立即 ack「已受理」,真正进度走 MODEL.event 广播 */
export const DownloadResult = z.object({ ok: z.boolean() })
export type DownloadResult = z.infer<typeof DownloadResult>

export const CancelArgs = z.object({ modelKey: z.string() })
export type CancelArgs = z.infer<typeof CancelArgs>
export const CancelResult = z.object({ ok: z.boolean() })
export type CancelResult = z.infer<typeof CancelResult>

export const DeleteArgs = z.object({ modelKey: z.string() })
export type DeleteArgs = z.infer<typeof DeleteArgs>
export const DeleteResult = z.object({ ok: z.boolean() })
export type DeleteResult = z.infer<typeof DeleteResult>

/** main → renderer 下载事件;discriminated union on `phase`(对齐 §5.6) */
export const ModelEvent = z.discriminatedUnion('phase', [
  z.object({
    phase: z.literal('start'),
    modelKey: z.string(),
    totalBytes: z.number().int().nonnegative(),
    source: z.string(),
  }),
  z.object({
    phase: z.literal('progress'),
    modelKey: z.string(),
    downloadedBytes: z.number().int().nonnegative(),
    totalBytes: z.number().int().nonnegative(),
    bytesPerSec: z.number().nonnegative(),
    etaMs: z.number().nonnegative(),
  }),
  z.object({
    phase: z.literal('source-switched'),
    modelKey: z.string(),
    from: z.string(),
    to: z.string(),
    reason: z.enum(['network', 'checksum']),
  }),
  z.object({
    phase: z.literal('done'),
    modelKey: z.string(),
    durationMs: z.number().int().nonnegative(),
  }),
  z.object({
    phase: z.literal('error'),
    modelKey: z.string(),
    code: z.string(),
    message: z.string(),
  }),
  z.object({
    phase: z.literal('cancelled'),
    modelKey: z.string(),
  }),
])
export type ModelEvent = z.infer<typeof ModelEvent>
