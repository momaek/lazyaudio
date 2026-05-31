// T13 — 录音目录路径管理
//
// data-model.md §1.1:
//   macOS:   ~/Library/Application Support/LazyAudio/recordings/{id}/
//   Windows: %APPDATA%\LazyAudio\recordings\{id}\
// (app.setName('LazyAudio') 已在 src/main/index.ts 头部调,所以 userData 路径已含 LazyAudio)

import path from 'node:path'
import fs from 'node:fs/promises'
import { app } from 'electron'

export function getRecordingsDir(): string {
  return path.join(app.getPath('userData'), 'recordings')
}

export function getRecordingDir(recordingId: string): string {
  return path.join(getRecordingsDir(), recordingId)
}

export async function ensureRecordingDir(recordingId: string): Promise<string> {
  const dir = getRecordingDir(recordingId)
  await fs.mkdir(dir, { recursive: true })
  return dir
}

export function getAudioFilePath(recordingId: string, trackId: 'mic' | 'system'): string {
  return path.join(getRecordingDir(recordingId), `${trackId}.wav`)
}

/** T14 — mixed.wav 输出路径 */
export function getMixedFilePath(recordingId: string): string {
  return path.join(getRecordingDir(recordingId), 'mixed.wav')
}

export function getMetaFilePath(recordingId: string): string {
  return path.join(getRecordingDir(recordingId), 'meta.json')
}

/** T32 — Pass B 离线转录结果 */
export function getTranscriptFilePath(recordingId: string): string {
  return path.join(getRecordingDir(recordingId), 'transcript.json')
}

/** T34 — Pass A 实时转录结果(录音中增量写;UI 在 transcript.json 缺时回退读这份) */
export function getLiveTranscriptFilePath(recordingId: string): string {
  return path.join(getRecordingDir(recordingId), 'transcript.live.json')
}

export function getMetaTmpPath(recordingId: string): string {
  return path.join(getRecordingDir(recordingId), 'meta.json.tmp')
}
