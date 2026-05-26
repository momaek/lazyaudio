// T13 — recording meta.json schema v1(minimum 字段)
//
// 设计来源:data-model.md §2.1
// 完整 schema 在 data-model 里包含很多字段(transcribe / summary / warnings 等),
// T13 阶段只需要 audio 域基础字段;T15(库) / T15a(恢复扫描) / M4(转录) / M5(摘要) 各 T
// 实施时按需加字段(改 schemaVersion 才需破坏性 migration,详见 data-model §10)。

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

  // 出错时填(spec data-model §2)
  failedReason: z.string().optional(),
})
export type RecordingMetaV1 = z.infer<typeof RecordingMetaV1>

/** 当前最新 schema 的 type alias,便于外部 import 不带版本号 */
export type RecordingMeta = RecordingMetaV1
export const RecordingMeta = RecordingMetaV1
