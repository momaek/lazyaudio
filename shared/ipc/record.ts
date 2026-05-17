import { z } from 'zod'
export { RECORD as CHANNEL } from './channels'

// record domain:录音状态机 + 控制(start / pause / resume / stop)+ tick 事件。
// T04 阶段只占位:CHANNEL 在 channels.ts,schema 留最小骨架,T11-T17 充实。

// 占位:T11/T13 起填实际字段(sessionType、sources、durationMs、状态机 union 等)
export const StartArgs = z.object({}).passthrough()
export type StartArgs = z.infer<typeof StartArgs>

export const StartResult = z.object({
  recordingId: z.string(),
})
export type StartResult = z.infer<typeof StartResult>
