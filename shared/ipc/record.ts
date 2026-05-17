import { z } from 'zod'

// record domain:录音状态机 + 控制(start / pause / resume / stop)+ tick 事件。
// T04 阶段只占位:CHANNEL 列出全部已规划通道,schema 留最小骨架,T11-T17 充实。

export const CHANNEL = {
  // 主进程 ← renderer:invoke
  getPrepDefaults: 'record:get-prep-defaults',
  start: 'record:start',
  pause: 'record:pause',
  resume: 'record:resume',
  stop: 'record:stop',
  // 主进程 → renderer:event
  tick: 'record:tick',
  stateChanged: 'record:state-changed',
} as const

// 占位:T11/T13 起填实际字段(sessionType、sources、durationMs、状态机 union 等)
export const StartArgs = z.object({}).passthrough()
export type StartArgs = z.infer<typeof StartArgs>

export const StartResult = z.object({
  recordingId: z.string(),
})
export type StartResult = z.infer<typeof StartResult>
