import { z } from 'zod'
export { SETTINGS as CHANNEL } from './channels'

// settings domain:get / set / changed 广播。
// T04 阶段只占位;T18 起补全字段 schema + safeStorage 加密的 secret 拆分。
// CHANNEL 在 channels.ts(无 zod 依赖,preload 可在 sandbox 下安全 import)。

// 占位:T18 填实际字段(privacyMode / shortcuts / theme / paths / cloud API key 引用等)
export const GetResult = z.object({}).passthrough()
export type GetResult = z.infer<typeof GetResult>

export const SetArgs = z.object({}).passthrough()
export type SetArgs = z.infer<typeof SetArgs>
