import { z } from 'zod'
import { LIBRARY as CHANNEL } from './channels'
import { SessionType } from './record'

export { CHANNEL }

export const LibraryEntry = z.object({
  id: z.string(),
  title: z.string(),
  sessionType: SessionType,
  startedAt: z.number().int(),
  durationMs: z.number().int(),
  status: z.enum(['recording', 'stopping', 'done', 'failed', 'failed-partial']),
  mixStatus: z.enum(['pending', 'running', 'done', 'failed', 'skipped']).optional(),
  /** T32 转录子状态(列表项 / 详情区据此显示「转录中 / 失败」) */
  transcribeStatus: z.enum(['idle', 'pending', 'running', 'done', 'failed']).optional(),
})
export type LibraryEntry = z.infer<typeof LibraryEntry>

export const LibraryGroup = z.object({
  label: z.string(),
  entries: z.array(LibraryEntry),
})
export type LibraryGroup = z.infer<typeof LibraryGroup>

export const ListArgs = z.object({}).optional()
export type ListArgs = z.infer<typeof ListArgs>

export const ListResult = z.object({
  groups: z.array(LibraryGroup),
  total: z.number().int(),
})
export type ListResult = z.infer<typeof ListResult>

// ---- T55 列表项操作 ----

export const RenameArgs = z.object({
  recordingId: z.string(),
  title: z.string().trim().min(1).max(200),
})
export type RenameArgs = z.infer<typeof RenameArgs>

export const RenameResult = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
})
export type RenameResult = z.infer<typeof RenameResult>

export const DeleteArgs = z.object({ recordingId: z.string() })
export type DeleteArgs = z.infer<typeof DeleteArgs>

export const DeleteResult = z.object({
  ok: z.boolean(),
  /** 'recording-active' = 正在录这条,不允许删 */
  error: z.string().optional(),
})
export type DeleteResult = z.infer<typeof DeleteResult>

export const ShowInFolderArgs = z.object({ recordingId: z.string() })
export type ShowInFolderArgs = z.infer<typeof ShowInFolderArgs>

export const ShowInFolderResult = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
})
export type ShowInFolderResult = z.infer<typeof ShowInFolderResult>
