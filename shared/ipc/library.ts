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
