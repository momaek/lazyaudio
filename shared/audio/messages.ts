// T12 — capture renderer ↔ main 之间走 MessagePort 的 PCM 流消息 schema。
//
// 来源:
// - audio-capture.md §4.1 IPC 协议草案
// - ipc-contract.md §2.3 PCM 流 MessageChannel
//
// 不在这里:audio:start-capture / audio:stop-capture 控制信令是 main → renderer 走
// ipcMain.send / webContents.send 的普通 IPC,channel 名在 shared/ipc/channels.ts AUDIO,
// payload 可以直接用 TS interface(简单的 recordingId / sources 字段),不需要 zod。

import { z } from 'zod'

// ---- 共用类型 ----
export const TrackId = z.enum(['mic', 'system'])
export type TrackId = z.infer<typeof TrackId>

// ---- renderer → main ----

/** capture renderer 启 capture 拿到第一帧后发,通知 main 这一路要开始推 PCM */
export const TrackOpen = z.object({
  type: z.literal('track-open'),
  recordingId: z.string(),
  trackId: TrackId,
  sampleRate: z.number().int(), // 48000(固定,audio-capture §2.4)
  channels: z.number().int(), // 1(mic) / 2(system)
  bitDepth: z.literal(16), // Int16,worklet 已转
})
export type TrackOpen = z.infer<typeof TrackOpen>

/** 每帧 PCM,100ms / 4800 sample(audio-capture §3.3) */
export const Chunk = z.object({
  type: z.literal('chunk'),
  recordingId: z.string(),
  trackId: TrackId,
  seq: z.number().int(), // 单调递增,从 0 起,用于 main 端 sanity + writer-ack 反馈
  pcm: z.any(), // ArrayBuffer(transferable);zod 不校验 binary
  ts: z.number(), // worklet 端 currentTime(秒,AudioContext 时基),便于跨路对齐
})
export type Chunk = Omit<z.infer<typeof Chunk>, 'pcm'> & { pcm: ArrayBuffer }

/** 这一路停了(用户点 stop / 权限被收 / capture 错) */
export const TrackClose = z.object({
  type: z.literal('track-close'),
  recordingId: z.string(),
  trackId: TrackId,
  reason: z.enum(['normal', 'permission-revoked', 'error']),
  error: z.string().optional(),
})
export type TrackClose = z.infer<typeof TrackClose>

export const RendererToMain = z.discriminatedUnion('type', [TrackOpen, Chunk, TrackClose])
export type RendererToMain = z.infer<typeof RendererToMain> | Chunk // Chunk 的 pcm 真类型在外层

// ---- main → renderer ----

/** main 收到 PCM 写盘 / 统计后回执;renderer 端做背压检测 */
export const WriterAck = z.object({
  type: z.literal('writer-ack'),
  recordingId: z.string(),
  trackId: TrackId,
  lastSeq: z.number().int(),
  bytesWritten: z.number().int(),
})
export type WriterAck = z.infer<typeof WriterAck>

/** writer 出错(T12 阶段不写盘所以这条暂时只 reserve 不用,T13 落 WAV 时启用) */
export const WriterError = z.object({
  type: z.literal('writer-error'),
  recordingId: z.string(),
  trackId: TrackId,
  code: z.string(),
  message: z.string(),
})
export type WriterError = z.infer<typeof WriterError>

export const MainToRenderer = z.discriminatedUnion('type', [WriterAck, WriterError])
export type MainToRenderer = z.infer<typeof MainToRenderer>

// ---- audio control IPC payload(常规 ipcMain.send,非 MessagePort) ----

/** main → capture renderer:启 capture 指令 */
export const StartCaptureArgs = z.object({
  recordingId: z.string(),
  sources: z.object({
    mic: z.boolean(),
    system: z.boolean(),
  }),
})
export type StartCaptureArgs = z.infer<typeof StartCaptureArgs>

/** main → capture renderer:停 capture 指令 */
export const StopCaptureArgs = z.object({
  recordingId: z.string(),
})
export type StopCaptureArgs = z.infer<typeof StopCaptureArgs>
