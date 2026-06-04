// T54 — 汇集某录音的导出数据(meta + transcript + summary)。
// transcript 优先 Pass B(transcript.json),缺则回退 Pass A(transcript.live.json)。

import { readMeta } from '../recording/meta-store'
import { readTranscript } from '../transcribe/transcript-store'
import { readLiveTranscript } from '../transcribe/live-store'
import { readSummaryText } from '../llm/summarizer'
import type { ExportInput } from './format'

/** 录音不存在(无 meta)返回 null;transcript / summary 缺失各自为 null。 */
export async function collectExportData(recordingId: string): Promise<ExportInput | null> {
  const meta = await readMeta(recordingId)
  if (!meta) return null
  const transcript = (await readTranscript(recordingId)) ?? (await readLiveTranscript(recordingId))
  const summary = await readSummaryText(recordingId)
  return { meta, transcript, summary }
}
