// T32 — transcript.json 原子读写(同 meta-store 套路:.tmp + rename + zod 校验)。

import fs from 'node:fs/promises'
import { Transcript } from '@shared/transcribe/transcript'
import { getTranscriptFilePath } from '../recording/paths'
import { ensureRecordingDir } from '../recording/paths'
import { logger } from '../logger'

export async function writeTranscript(transcript: Transcript): Promise<void> {
  const parsed = Transcript.safeParse(transcript)
  if (!parsed.success) {
    throw new Error(`writeTranscript: schema invalid — ${parsed.error.message}`)
  }
  await ensureRecordingDir(transcript.recordingId)
  const finalPath = getTranscriptFilePath(transcript.recordingId)
  const tmp = `${finalPath}.tmp`
  await fs.writeFile(tmp, JSON.stringify(parsed.data, null, 2), 'utf8')
  await fs.rename(tmp, finalPath)
}

export async function readTranscript(recordingId: string): Promise<Transcript | null> {
  try {
    const json = await fs.readFile(getTranscriptFilePath(recordingId), 'utf8')
    const parsed = Transcript.safeParse(JSON.parse(json))
    if (!parsed.success) {
      logger.warn(`readTranscript: schema invalid for ${recordingId}: ${parsed.error.message}`)
      return null
    }
    return parsed.data
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
}
