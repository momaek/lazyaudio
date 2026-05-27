import fs from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import type { RecordingMeta as RecordingMetaType, AudioFileInfo } from '@shared/recording/meta'
import type { TrackId } from '@shared/audio/messages'
import { logger } from '../logger'
import { getAudioFilePath, getMetaFilePath, getMetaTmpPath, getRecordingsDir } from './paths'
import { readMeta, writeMeta } from './meta-store'
import { repairWavHeader, type WavHeaderInfo } from './wav-recovery'

const TRACK_IDS: TrackId[] = ['mic', 'system']

async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw e
  }
}

async function reconcileMetaTmp(recordingId: string): Promise<void> {
  const tmp = getMetaTmpPath(recordingId)
  const finalPath = getMetaFilePath(recordingId)
  const hasTmp = await pathExists(tmp)
  if (!hasTmp) return

  const hasFinal = await pathExists(finalPath)
  if (hasFinal) {
    await fs.rm(tmp, { force: true })
    logger.info(`[recovery] removed stale meta tmp: ${recordingId}`)
    return
  }

  await fs.rename(tmp, finalPath)
  logger.info(`[recovery] promoted meta tmp: ${recordingId}`)
}

function makeAudioFileInfo(trackId: TrackId, info: WavHeaderInfo | null): AudioFileInfo | null {
  if (!info) return null
  return {
    path: `${trackId}.wav`,
    codec: 'wav-pcm-s16le',
    sampleRate: info.sampleRate,
    channels: info.channels,
    bitDepth: info.bitDepth,
    bytes: info.dataBytes,
  }
}

async function repairTrack(
  recordingId: string,
  trackId: TrackId,
): Promise<{
  fileInfo: AudioFileInfo | null
  durationMs: number
}> {
  const info = await repairWavHeader(getAudioFilePath(recordingId, trackId))
  const fileInfo = makeAudioFileInfo(trackId, info)
  return { fileInfo, durationMs: info?.durationMs ?? 0 }
}

function isInterrupted(meta: RecordingMetaType): boolean {
  return meta.status === 'recording' || meta.status === 'stopping'
}

async function recoverInterruptedMeta(meta: RecordingMetaType): Promise<void> {
  if (!isInterrupted(meta)) return

  const repaired = await Promise.all(TRACK_IDS.map((trackId) => repairTrack(meta.id, trackId)))
  const audioFiles = { ...meta.audioFiles }
  let maxDurationMs = 0
  let hasAudio = false

  for (let i = 0; i < TRACK_IDS.length; i++) {
    const trackId = TRACK_IDS[i]
    const result = repaired[i]
    if (!trackId || !result?.fileInfo) continue
    audioFiles[trackId] = result.fileInfo
    maxDurationMs = Math.max(maxDurationMs, result.durationMs)
    hasAudio = true
  }

  const endedAt = meta.startedAt + maxDurationMs
  await writeMeta({
    ...meta,
    endedAt,
    durationMs: maxDurationMs,
    status: 'failed-partial',
    audioFiles,
    mixStatus: hasAudio ? 'skipped' : meta.mixStatus,
    failedReason:
      meta.failedReason ?? 'app exited before recording stopped; recovered on next launch',
    warnings: [
      ...(meta.warnings ?? []),
      { code: 'recovered-after-crash', at: Date.now(), detail: { previousStatus: meta.status } },
    ],
  })
  logger.info(`[recovery] recovered interrupted recording ${meta.id}, duration=${maxDurationMs}ms`)
}

async function recoverOne(recordingId: string): Promise<void> {
  await reconcileMetaTmp(recordingId)
  const meta = await readMeta(recordingId)
  if (!meta) return
  await recoverInterruptedMeta(meta)
}

export async function recoverRecordingsOnStartup(): Promise<void> {
  let dirents: Dirent[]
  try {
    dirents = await fs.readdir(getRecordingsDir(), { withFileTypes: true })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return
    throw e
  }

  for (const dirent of dirents) {
    if (!dirent.isDirectory()) continue
    await recoverOne(dirent.name).catch((e) => {
      logger.warn(`[recovery] failed for ${dirent.name}: ${String(e)}`)
    })
  }
}
