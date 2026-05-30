// T39 — 转录全文搜索(扫所有录音的 transcript.json,按段命中)。
// v0.1 简化:线性扫盘 + substring 匹配(无倒排索引;录音量上来再优化)。

import type { SearchResult, SearchHit } from '@shared/ipc/transcribe'
import { scanRecordingMetas } from '../library/scanner'
import { readTranscript } from './transcript-store'

const SNIPPET_CONTEXT = 30

function makeSnippet(text: string, hitIndex: number, hitLen: number): string {
  const from = Math.max(0, hitIndex - SNIPPET_CONTEXT)
  const to = Math.min(text.length, hitIndex + hitLen + SNIPPET_CONTEXT)
  let s = text.slice(from, to)
  if (from > 0) s = `…${s}`
  if (to < text.length) s = `${s}…`
  return s
}

export async function searchTranscripts(query: string): Promise<SearchResult> {
  const q = query.trim().toLowerCase()
  if (!q) return { hits: [], scanned: 0 }

  const metas = await scanRecordingMetas()
  let scanned = 0
  const hits: SearchHit[] = []

  for (const meta of metas) {
    const transcript = await readTranscript(meta.id)
    if (!transcript) continue
    scanned++
    for (const seg of transcript.segments) {
      const idx = seg.text.toLowerCase().indexOf(q)
      if (idx >= 0) {
        hits.push({
          recordingId: meta.id,
          title: meta.title,
          segmentId: seg.segmentId,
          start: seg.start,
          snippet: makeSnippet(seg.text, idx, q.length),
        })
      }
    }
  }
  return { hits, scanned }
}
