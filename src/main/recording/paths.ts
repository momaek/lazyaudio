// T13 — 录音目录路径管理
//
// data-model.md §1.1:
//   macOS:   ~/Library/Application Support/LazyAudio/recordings/{id}/
//   Windows: %APPDATA%\LazyAudio\recordings\{id}\
// (app.setName('LazyAudio') 已在 src/main/index.ts 头部调,所以 userData 路径已含 LazyAudio)

import path from 'node:path'
import fs from 'node:fs/promises'
import { app } from 'electron'
import { getSettings } from '../settings/settings-store'

/** 默认录音目录(userData/recordings)。 */
export function getDefaultRecordingsDir(): string {
  return path.join(app.getPath('userData'), 'recordings')
}

/** T57 — 录音目录:settings.recording.saveDir 非空则用它,否则默认。
 *  saveDir 改后只影响新录音(已有录音不迁移,settings.md Tab2)。 */
export function getRecordingsDir(): string {
  try {
    const custom = getSettings().recording.saveDir
    if (custom) return custom
  } catch {
    /* settings 未就绪(极早期调用)→ 退回默认 */
  }
  return getDefaultRecordingsDir()
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

/** T51 — LLM 摘要(markdown) */
export function getSummaryFilePath(recordingId: string): string {
  return path.join(getRecordingDir(recordingId), 'summary.md')
}

export function getMetaTmpPath(recordingId: string): string {
  return path.join(getRecordingDir(recordingId), 'meta.json.tmp')
}
