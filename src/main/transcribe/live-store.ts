// T34 — transcript.live.json 原子读写(Pass A 实时转录;同 transcript-store 套路)。

import fs from 'node:fs/promises'
import { Transcript } from '@shared/transcribe/transcript'
import { getLiveTranscriptFilePath, ensureRecordingDir } from '../recording/paths'
import { logger } from '../logger'

export async function writeLiveTranscript(transcript: Transcript): Promise<void> {
  const parsed = Transcript.safeParse(transcript)
  if (!parsed.success) {
    throw new Error(`writeLiveTranscript: schema invalid — ${parsed.error.message}`)
  }
  await ensureRecordingDir(transcript.recordingId)
  const finalPath = getLiveTranscriptFilePath(transcript.recordingId)
  const tmp = `${finalPath}.tmp`
  await fs.writeFile(tmp, JSON.stringify(parsed.data, null, 2), 'utf8')
  await fs.rename(tmp, finalPath)
}

export async function readLiveTranscript(recordingId: string): Promise<Transcript | null> {
  try {
    const json = await fs.readFile(getLiveTranscriptFilePath(recordingId), 'utf8')
    const parsed = Transcript.safeParse(JSON.parse(json))
    if (!parsed.success) {
      logger.warn(`readLiveTranscript: schema invalid for ${recordingId}: ${parsed.error.message}`)
      return null
    }
    return parsed.data
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
}
