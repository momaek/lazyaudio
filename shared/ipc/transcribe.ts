// T32/T33/T37/T39 — 转录 IPC schema。

import { z } from 'zod'
import { TRANSCRIBE as CHANNEL } from './channels'
import { Transcript } from '../transcribe/transcript'
import { TranscribeStatus } from '../recording/meta'

export { CHANNEL, TranscribeStatus }

// ---- get transcript（T33 详情区取转录）----
export const GetTranscriptArgs = z.object({ recordingId: z.string() })
export type GetTranscriptArgs = z.infer<typeof GetTranscriptArgs>

export const GetTranscriptResult = z.object({
  /** 转录子状态;'idle' 表示从没转录过 */
  status: TranscribeStatus,
  transcript: Transcript.nullable(),
  error: z.string().optional(),
})
export type GetTranscriptResult = z.infer<typeof GetTranscriptResult>

// ---- retry（T37 失败重试 / 手动触发）----
export const RetryArgs = z.object({ recordingId: z.string() })
export type RetryArgs = z.infer<typeof RetryArgs>
export const RetryResult = z.object({ ok: z.boolean() })
export type RetryResult = z.infer<typeof RetryResult>

// ---- status broadcast ----
export const StatusChangedEvent = z.object({
  recordingId: z.string(),
  status: TranscribeStatus,
  error: z.string().optional(),
  processedSec: z.number().optional(),
  totalSec: z.number().optional(),
})
export type StatusChangedEvent = z.infer<typeof StatusChangedEvent>

// ---- search（T39 全文搜索）----
export const SearchArgs = z.object({ query: z.string() })
export type SearchArgs = z.infer<typeof SearchArgs>

export const SearchHit = z.object({
  recordingId: z.string(),
  title: z.string(),
  /** 命中段落 id（点击可跳播） */
  segmentId: z.string(),
  /** 命中段起点（秒） */
  start: z.number(),
  /** 带上下文的片段文本（命中词前后截断） */
  snippet: z.string(),
})
export type SearchHit = z.infer<typeof SearchHit>

export const SearchResult = z.object({
  hits: z.array(SearchHit),
  /** 扫了多少条录音 */
  scanned: z.number().int(),
})
export type SearchResult = z.infer<typeof SearchResult>
