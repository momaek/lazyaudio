// T51 — 把 transcript 组装成喂给 LLM 的 user message(llm-templates.md §1 + transcription-pipeline §6.3/§6.4)。
// 格式:每段一行 `[<speaker> <HH:MM:SS>] <text>`;某轨空 → 顶部插 [sysmeta] 行。
// 长度处理(§1.2):< 80% 预算整篇;80-100% 首尾各 20% + 中间截断占位;> 100% 抛 too-long。

import type { Transcript } from '@shared/transcribe/transcript'

/** 转录过长(超模型上下文),无法摘要 */
export class TranscriptTooLongError extends Error {
  constructor() {
    super('transcript-too-long')
    this.name = 'TranscriptTooLongError'
  }
}

function formatHMS(sec: number): string {
  const total = Math.max(0, Math.floor(sec))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

function segLine(speaker: string, start: number, text: string): string {
  return `[${speaker} ${formatHMS(start)}] ${text}`
}

/** 中文粗估:1.5 char/token(§1.2) */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 1.5)
}

/** 顶部 sysmeta 行(§1.3):告诉 LLM 录音轨道情况 */
function sysmetaLine(speakers: Set<string>): string | null {
  if (speakers.has('mixed')) {
    return '[sysmeta] 本次转录基于混合轨(mic+system 合一),未区分录音者(我)与对方,所有段标为 mixed'
  }
  const hasMic = speakers.has('mic')
  const hasSys = speakers.has('system')
  if (hasMic && !hasSys) return '[sysmeta] 本次录音仅 mic 路有内容(用户关闭了 system 音源)'
  if (hasSys && !hasMic) return '[sysmeta] 本次录音仅 system 路有内容(用户关闭了 mic 音源)'
  return null
}

export interface AssembleResult {
  userMessage: string
  truncated: boolean
}

/**
 * 组装 user message。
 * @param transcriptBudgetTokens 留给转录文本的 token 预算(= contextWindow - 系统/输出预留)
 */
export function assembleUserMessage(
  transcript: Transcript,
  transcriptBudgetTokens: number,
): AssembleResult {
  const segs = transcript.segments
    .filter((s) => s.stability === 'confirmed' && s.text.trim())
    .slice()
    .sort((a, b) => a.start - b.start)

  const speakers = new Set(segs.map((s) => s.speaker))
  const sysmeta = sysmetaLine(speakers)
  const header = sysmeta ? `${sysmeta}\n` : ''

  const lines = segs.map((s) => segLine(s.speaker, s.start, s.text.trim()))
  const full = header + lines.join('\n')

  const estimate = estimateTokens(full)
  if (estimate <= transcriptBudgetTokens * 0.8) {
    return { userMessage: full, truncated: false }
  }
  if (estimate > transcriptBudgetTokens) {
    throw new TranscriptTooLongError()
  }

  // 80-100%:保留首尾各 20% 段,中间占位
  const keep = Math.max(1, Math.floor(lines.length * 0.2))
  const head = lines.slice(0, keep)
  const tail = lines.slice(lines.length - keep)
  const droppedCount = lines.length - head.length - tail.length
  const droppedMin = Math.round((segs[lines.length - keep - 1]!.start - segs[keep - 1]!.start) / 60)
  const placeholder = `[...截断 ${droppedCount} 段，约 ${droppedMin} 分钟...]`
  const userMessage = `${header}${head.join('\n')}\n${placeholder}\n${tail.join('\n')}`
  return { userMessage, truncated: true }
}
