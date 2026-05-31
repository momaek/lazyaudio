import type { ListResult, LibraryEntry, LibraryGroup } from '@shared/ipc/library'
import type { RecordingMeta } from '@shared/recording/meta'
import { scanRecordingMetas } from './scanner'

const DAY_MS = 24 * 60 * 60 * 1000

type GroupKey = 'today' | 'yesterday' | 'this-week' | 'this-month' | 'earlier'

const GROUP_LABEL: Record<GroupKey, string> = {
  today: '今天',
  yesterday: '昨天',
  'this-week': '本周',
  'this-month': '本月',
  earlier: '更早',
}

const GROUP_ORDER: GroupKey[] = ['today', 'yesterday', 'this-week', 'this-month', 'earlier']

function startOfLocalDay(ts: number): number {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function startOfLocalWeek(ts: number): number {
  const d = new Date(startOfLocalDay(ts))
  const day = d.getDay() || 7 // 周一作为一周起点
  d.setDate(d.getDate() - day + 1)
  return d.getTime()
}

function startOfLocalMonth(ts: number): number {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
}

function groupKeyFor(startedAt: number, now = Date.now()): GroupKey {
  const day = startOfLocalDay(startedAt)
  const today = startOfLocalDay(now)
  if (day === today) return 'today'
  if (day === today - DAY_MS) return 'yesterday'
  if (startedAt >= startOfLocalWeek(now)) return 'this-week'
  if (startedAt >= startOfLocalMonth(now)) return 'this-month'
  return 'earlier'
}

function toEntry(meta: RecordingMeta): LibraryEntry {
  return {
    id: meta.id,
    title: meta.title,
    sessionType: meta.sessionType,
    startedAt: meta.startedAt,
    durationMs: meta.durationMs,
    status: meta.status,
    mixStatus: meta.mixStatus,
    transcribeStatus: meta.transcribe?.status,
  }
}

export async function listLibrary(): Promise<ListResult> {
  const metas = await scanRecordingMetas()
  const entries = metas.map(toEntry).sort((a, b) => b.startedAt - a.startedAt)
  const grouped = new Map<GroupKey, LibraryEntry[]>()

  for (const entry of entries) {
    const key = groupKeyFor(entry.startedAt)
    const group = grouped.get(key) ?? []
    group.push(entry)
    grouped.set(key, group)
  }

  const groups: LibraryGroup[] = GROUP_ORDER.flatMap((key) => {
    const groupEntries = grouped.get(key)
    return groupEntries && groupEntries.length > 0
      ? [{ label: GROUP_LABEL[key], entries: groupEntries }]
      : []
  })

  return { groups, total: entries.length }
}
