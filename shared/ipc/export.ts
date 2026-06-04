// T54 — 导出域 schema。export:run(recordingId + format)→ 弹保存对话框 → 落盘。
import { z } from 'zod'
export { EXPORT as CHANNEL } from './channels'

export const ExportFormat = z.enum(['md', 'txt', 'srt'])
export type ExportFormat = z.infer<typeof ExportFormat>

export const RunArgs = z.object({
  recordingId: z.string(),
  format: ExportFormat,
})
export type RunArgs = z.infer<typeof RunArgs>

/** ok=true 且 canceled=false → filePath 为落盘路径;canceled=true → 用户取消保存对话框 */
export const RunResult = z.object({
  ok: z.boolean(),
  canceled: z.boolean(),
  filePath: z.string().optional(),
  error: z.string().optional(),
})
export type RunResult = z.infer<typeof RunResult>
