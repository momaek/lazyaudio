import { z } from 'zod'
export { SYSTEM as CHANNEL } from './channels'

// system domain:平台 / 健康检查 / 通知 / 路径 reveal 等。
// 本 PR 仅落地 ping(端到端 sanity);其余通道(permission / notify / reveal)留 M3+ 后续 T。
// 通道名在 channels.ts(无 zod 依赖,preload 可在 sandbox 下安全 import)。

// ---- ping ------------------------------------------------------------------
export const PingArgs = z.object({}).optional()
export type PingArgs = z.infer<typeof PingArgs>

export const PingResult = z.object({
  // 主进程 wall clock,unix ms
  tsMs: z.number().int().positive(),
  // 主进程的 Node / Electron 版本,renderer 用于诊断
  nodeVersion: z.string(),
  electronVersion: z.string(),
})
export type PingResult = z.infer<typeof PingResult>

// ---- T57 open-external(关于页外链)----
export const OpenExternalArgs = z.object({ url: z.string().url() })
export type OpenExternalArgs = z.infer<typeof OpenExternalArgs>

export const OpenExternalResult = z.object({ ok: z.boolean(), error: z.string().optional() })
export type OpenExternalResult = z.infer<typeof OpenExternalResult>
