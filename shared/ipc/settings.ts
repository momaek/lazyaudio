import { z } from 'zod'

// settings domain:get / set / changed 广播。
// T04 阶段只占位;T18 起补全字段 schema + safeStorage 加密的 secret 拆分。

export const CHANNEL = {
  get: 'settings:get',
  set: 'settings:set',
  changed: 'settings:changed', // main → renderer broadcast
} as const

// 占位:T18 填实际字段(privacyMode / shortcuts / theme / paths / cloud API key 引用等)
export const GetResult = z.object({}).passthrough()
export type GetResult = z.infer<typeof GetResult>

export const SetArgs = z.object({}).passthrough()
export type SetArgs = z.infer<typeof SetArgs>
