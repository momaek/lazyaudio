import { z } from 'zod'
export { RECORD as CHANNEL } from './channels'

// record domain:录音状态机 + 控制(start / pause / resume / stop)+ tick 事件。
// T11 起填实 prep 浮窗相关 schema(getPrepDefaults / start / hidePrep);
// pause / resume / stop / tick / stateChanged schema 留 T13 / T17 实施时再补。

// 7 种 sessionType,与 TypeBadge 组件 (src/renderer/components/TypeBadge.tsx) + PRD §4.1 F1.1 对齐
export const SessionType = z.enum([
  'general',
  'meeting',
  'note',
  'interview-as-interviewer',
  'interview-as-candidate',
  'lecture',
  'podcast',
])
export type SessionType = z.infer<typeof SessionType>

// 录音音源开关
export const Sources = z.object({
  mic: z.boolean(),
  system: z.boolean(),
})
export type Sources = z.infer<typeof Sources>

// ---- record:get-prep-defaults ----
// prep 浮窗 mount 时拉默认值。
// T11 阶段 main 返 hardcoded 默认(general + mic + system 全开);
// T18 settings store 完成后改读 settings.recording.{lastSessionType, lastSourcesPerType}
export const PrepDefaultsArgs = z.object({}).optional()
export type PrepDefaultsArgs = z.infer<typeof PrepDefaultsArgs>

export const PrepDefaults = z.object({
  defaults: z.object({
    sessionType: SessionType,
    sources: Sources,
  }),
})
export type PrepDefaults = z.infer<typeof PrepDefaults>

// ---- record:start ----
// 用户在 prep 浮窗点"开始录音"或 Enter 时调。
// T11 阶段 main 仅 log + 返回 fake { recordingId, startedAt };
// 真实创建录音目录 / 开 writers / 启动 orchestrator 留 T13。
export const StartArgs = z.object({
  sessionType: SessionType,
  sources: Sources,
  title: z.string().min(1).max(200),
})
export type StartArgs = z.infer<typeof StartArgs>

export const StartResult = z.object({
  recordingId: z.string(),
  startedAt: z.number().int(), // ms epoch
})
export type StartResult = z.infer<typeof StartResult>

// ---- record:hide-prep ----
// 取消按钮 / Esc 通知 main 隐藏 prep 浮窗(浮窗常驻 hidden,不销毁;
// blur 自动 hide 仍独立工作)。T11 新增 channel,ipc-contract.md §2.1 同步加。
export const HidePrepArgs = z.object({}).optional()
export type HidePrepArgs = z.infer<typeof HidePrepArgs>

export const HidePrepResult = z.object({
  ok: z.boolean(),
})
export type HidePrepResult = z.infer<typeof HidePrepResult>

// ---- record:get-state / record:state-changed ----
// 录音状态机的可序列化快照。main 在每次状态转换后 broadcast(record:state-changed),
// renderer(主窗口)mount 时也可主动拉一次(record:get-state)。
// 字段与 main/audio/recorder-state.ts 的 RecorderState 对齐,只去掉非可序列化部分(本就都是基本类型)。
export const RecorderStatus = z.enum(['idle', 'preparing', 'recording', 'stopping'])
export type RecorderStatus = z.infer<typeof RecorderStatus>

export const RecorderSnapshot = z.object({
  status: RecorderStatus,
  recordingId: z.string().nullable(),
  sessionType: SessionType.nullable(),
  sources: Sources.nullable(),
  startedAt: z.number().int().nullable(), // ms epoch
})
export type RecorderSnapshot = z.infer<typeof RecorderSnapshot>

export const GetStateArgs = z.object({}).optional()
export type GetStateArgs = z.infer<typeof GetStateArgs>
