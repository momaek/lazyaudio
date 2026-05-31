// T32 — transcript.json schema(data-model.md §4.1)。
// Pass B(离线)写 transcript.json,pass='offline',全部 segment stability='confirmed'。

import { z } from 'zod'

export const TRANSCRIPT_SCHEMA_VERSION = 1

export const TranscriptSegment = z.object({
  /** 稳定 id;hypothesis→confirmed 原地替换依赖此(Pass B 独立分配) */
  segmentId: z.string(),
  /** 秒,相对录音起点 */
  start: z.number(),
  end: z.number(),
  text: z.string(),
  /** v0.1: 'mic' | 'system' | 'mixed' */
  speaker: z.string(),
  stability: z.enum(['hypothesis', 'confirmed']),
  confidence: z.number().optional(),
  tokens: z.array(z.object({ text: z.string(), start: z.number(), end: z.number() })).optional(),
})
export type TranscriptSegment = z.infer<typeof TranscriptSegment>

export const Transcript = z.object({
  schemaVersion: z.literal(TRANSCRIPT_SCHEMA_VERSION),
  recordingId: z.string(),
  pass: z.enum(['live', 'offline']),
  engine: z.string(),
  modelKey: z.string().optional(),
  modelName: z.string().optional(),
  language: z.string(),
  generatedAt: z.number().int(),
  durationMs: z.number().int(),
  segments: z.array(TranscriptSegment),
  partial: z.boolean().optional(),
})
export type Transcript = z.infer<typeof Transcript>
