// T54 — 导出格式生成器(纯函数,无 fs / electron,便于单测)。
// md = 元信息 + 摘要 + 转录;txt = 元信息 + 摘要 + 纯文本转录;srt = 标准时间戳字幕。
// v0.1 仅简体中文(settings.general.language 锁 'zh-CN'),会话类型标签在此硬编码 zh。

import type { RecordingMeta } from '@shared/recording/meta'
import type { Transcript } from '@shared/transcribe/transcript'
import type { SessionType } from '@shared/ipc/record'

export type ExportFormat = 'md' | 'txt' | 'srt'

export interface ExportInput {
  meta: RecordingMeta
  transcript: Transcript | null
  summary: string | null
}

const SESSION_LABEL_ZH: Record<SessionType, string> = {
  general: '通用',
  meeting: '会议',
  note: '笔记',
  'interview-as-interviewer': '面试官',
  'interview-as-candidate': '面试者',
  lecture: '课程',
  podcast: '播客',
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}
function pad3(n: number): string {
  return String(n).padStart(3, '0')
}

/** 时长 ms → HH:MM:SS */
export function formatDurationClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  return `${pad2(Math.floor(total / 3600))}:${pad2(Math.floor((total % 3600) / 60))}:${pad2(total % 60)}`
}

/** epoch ms → YYYY-MM-DD HH:mm(本地时区) */
export function formatDateTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** 秒 → SRT 时间戳 HH:MM:SS,mmm */
export function formatSrtTime(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000))
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${pad3(ms % 1000)}`
}

/** 秒 → [HH:MM:SS](md / 行内时间戳) */
export function formatStamp(sec: number): string {
  const total = Math.max(0, Math.floor(sec))
  return `[${pad2(Math.floor(total / 3600))}:${pad2(Math.floor((total % 3600) / 60))}:${pad2(total % 60)}]`
}

function sessionLabel(type: SessionType): string {
  return SESSION_LABEL_ZH[type] ?? type
}

function sourcesLabel(meta: RecordingMeta): string {
  const parts: string[] = []
  if (meta.sources.mic) parts.push('麦克风')
  if (meta.sources.system) parts.push('系统声音')
  return parts.join(' + ') || '—'
}

/** 元信息块(md / txt 共用,行前缀可配) */
function metaLines(meta: RecordingMeta): string[] {
  const lines = [
    `类型: ${sessionLabel(meta.sessionType)}`,
    `日期: ${formatDateTime(meta.startedAt)}`,
    `时长: ${formatDurationClock(meta.durationMs)}`,
    `来源: ${sourcesLabel(meta)}`,
  ]
  if (meta.transcribe?.engine) lines.push(`转录引擎: ${meta.transcribe.engine}`)
  return lines
}

/** 非空且非纯空白段(导出时跳过空段) */
function usableSegments(transcript: Transcript | null): Transcript['segments'] {
  if (!transcript) return []
  return transcript.segments.filter((s) => s.text.trim().length > 0)
}

export function buildMarkdown(input: ExportInput): string {
  const { meta, transcript, summary } = input
  const segs = usableSegments(transcript)
  const out: string[] = []
  out.push(`# ${meta.title}`, '')
  out.push(...metaLines(meta).map((l) => `- ${l}`), '')
  out.push('## 摘要', '')
  out.push(summary && summary.trim() ? summary.trim() : '（无摘要）', '')
  out.push('## 转录', '')
  if (segs.length === 0) {
    out.push('（无转录内容）')
  } else {
    for (const s of segs) out.push(`${formatStamp(s.start)} ${s.text.trim()}`)
  }
  return out.join('\n') + '\n'
}

export function buildPlainText(input: ExportInput): string {
  const { meta, transcript, summary } = input
  const segs = usableSegments(transcript)
  const out: string[] = []
  out.push(meta.title)
  out.push(metaLines(meta).join('  ·  '))
  out.push('')
  out.push('【摘要】')
  out.push(summary && summary.trim() ? summary.trim() : '（无摘要）')
  out.push('')
  out.push('【转录】')
  if (segs.length === 0) out.push('（无转录内容）')
  else for (const s of segs) out.push(s.text.trim())
  return out.join('\n') + '\n'
}

export function buildSrt(input: ExportInput): string {
  const segs = usableSegments(input.transcript)
  if (segs.length === 0) return ''
  return (
    segs
      .map(
        (s, i) =>
          `${i + 1}\n${formatSrtTime(s.start)} --> ${formatSrtTime(s.end)}\n${s.text.trim()}`,
      )
      .join('\n\n') + '\n'
  )
}

export function renderExport(format: ExportFormat, input: ExportInput): string {
  switch (format) {
    case 'md':
      return buildMarkdown(input)
    case 'txt':
      return buildPlainText(input)
    case 'srt':
      return buildSrt(input)
  }
}

/** 导出默认文件名(不含扩展名外的非法字符);标题里的路径分隔符等替换掉 */
export function defaultExportBaseName(meta: RecordingMeta): string {
  return meta.title.replace(/[/\\:*?"<>|]/g, '_').trim() || meta.id
}
