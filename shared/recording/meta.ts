// T13/T14 — recording meta.json schema v1(minimum 字段)
//
// 设计来源:data-model.md §2.1
// 完整 schema 在 data-model 里包含很多字段(transcribe / summary / warnings 等),
// T13 阶段只需要 audio 域基础字段;T15(库) / T15a(恢复扫描) / M4(转录) / M5(摘要) 各 T
// 实施时按需加字段(改 schemaVersion 才需破坏性 migration,详见 data-model §10)。
//
// T14 增量(向后兼容,字段 optional):
//   - mixStatus:混音子状态机(audio-capture §6.0);不阻塞主 status='done'。
//   - warnings:非致命警告数组(data-model §1.5)。

import { z } from 'zod'
import { SessionType, Sources } from '../ipc/record'

export const SCHEMA_VERSION = 1

/** 单路音频文件元信息 */
export const AudioFileInfo = z.object({
  path: z.string(), // 相对 recordings/{id}/ 的路径,如 "mic.wav" / "system.wav" / "mixed.wav"
  codec: z.literal('wav-pcm-s16le'),
  sampleRate: z.number().int(),
  channels: z.number().int(), // 实测可能 mic 也是 stereo(macOS 内置 mic 行为,T12 已 doc),按拿到的 channels 写
  bitDepth: z.number().int(),
  bytes: z.number().int(), // close 时回填(audioFiles 的 size)
})
export type AudioFileInfo = z.infer<typeof AudioFileInfo>

/** 非致命警告(data-model §1.5):pcm-dropouts / mix-failed / permission-revoked-mid / disk-slow 等 */
export const Warning = z.object({
  code: z.string(),
  at: z.number().int(),
  detail: z.unknown().optional(),
})
export type Warning = z.infer<typeof Warning>

/** 转录子状态机(data-model §2.1)。M4 T32 加;optional 向后兼容老 meta。 */
export const TranscribeStatus = z.enum(['idle', 'pending', 'running', 'done', 'failed'])
export type TranscribeStatus = z.infer<typeof TranscribeStatus>

export const TranscribeMeta = z.object({
  status: TranscribeStatus,
  engine: z.enum(['local-sense-voice', 'openai-compatible']).optional(),
  modelKey: z.string().optional(),
  startedAt: z.number().int().optional(),
  finishedAt: z.number().int().optional(),
  /** status==='failed' 时填 */
  error: z.string().optional(),
})
export type TranscribeMeta = z.infer<typeof TranscribeMeta>

/** 摘要子状态机(data-model §2.1)。T51 加;optional 向后兼容。 */
export const SummaryStatus = z.enum(['idle', 'pending', 'running', 'done', 'failed'])
export type SummaryStatus = z.infer<typeof SummaryStatus>

export const SummaryMeta = z.object({
  status: SummaryStatus,
  templateId: z.string().optional(),
  model: z.string().optional(),
  generatedAt: z.number().int().optional(),
  /** status==='failed' 时填(auth / rate-limit / too-long / network / ...) */
  error: z.string().optional(),
})
export type SummaryMeta = z.infer<typeof SummaryMeta>

/** v1 minimum:T13 必填字段;extension 字段 T15/T15a/M4/M5 加 */
export const RecordingMetaV1 = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string(), // ULID,与目录名一致
  appVersion: z.string(),

  title: z.string(),
  sessionType: SessionType,

  startedAt: z.number().int(), // ms epoch
  endedAt: z.number().int().optional(),
  durationMs: z.number().int(), // 实际有效录音(不含 pause);T13 = endedAt - startedAt(还没 pause)

  sources: Sources,

  /** 录音状态机最终态 */
  status: z.enum(['recording', 'stopping', 'done', 'failed', 'failed-partial']),

  audioFiles: z.object({
    mic: AudioFileInfo.optional(),
    system: AudioFileInfo.optional(),
    mixed: AudioFileInfo.optional(), // T14 mixdown 实施后才写
  }),

  /** 混音子状态机(T14;audio-capture §6.0)。可选 — T13 老 meta 没这字段也能 parse */
  mixStatus: z.enum(['pending', 'running', 'done', 'failed', 'skipped']).optional(),

  /** 转录子状态机(T32)。可选 — 老 meta / 还没转录的 meta 没这字段也能 parse */
  transcribe: TranscribeMeta.optional(),

  /** 摘要子状态机(T51)。可选 — 没摘要的 meta 没这字段也能 parse */
  summary: SummaryMeta.optional(),

  /** 非致命警告;mix-failed / pcm-dropouts 等都进这里(data-model §1.5) */
  warnings: z.array(Warning).optional(),

  // 出错时填(spec data-model §2)
  failedReason: z.string().optional(),
})
export type RecordingMetaV1 = z.infer<typeof RecordingMetaV1>

/** 当前最新 schema 的 type alias,便于外部 import 不带版本号 */
export type RecordingMeta = RecordingMetaV1
export const RecordingMeta = RecordingMetaV1
