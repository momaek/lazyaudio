// T14 — mixdown:stop 后离线合成 mixed.wav
//
// 设计来源:audio-capture.md §6
// - 时机:session.stop 写完 final meta 后,调用方 fire-and-forget 调 runMixdown()
// - 独立子状态机 mixStatus(meta.mixStatus):pending → running → done / failed / skipped
//   **不**阻塞主 status='done'(用户停止后录音立即出现在库里)
// - 算法:mic mono → 复制到 L/R;sys stereo as-is;mix = clamp((mic + sys_L)/2, ...)
//   - mic 可能 stereo(macOS 内置 mic,T12 已 doc):同 ch 相加平均
//   - 单源(只 mic 或只 sys):直接 stereo 化复制,不平均(避免音量减半)
// - 零漂移补偿:spike-005 数据 < 21μs / 12s,简单 sample-by-sample;长度不齐取 min frames
// - 流式读写:不全量 readFile(30min mic.wav = 172 MB);按 FRAMES_PER_CHUNK 推进
// - 失败处理(audio-capture §6.3):mixStatus='failed' + warnings.push('mix-failed');
//   主 status 保持 'done';mixed.wav 残留文件清掉

import fs from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { logger } from '../logger'
import { readMeta, writeMeta } from './meta-store'
import { getAudioFilePath, getMixedFilePath } from './paths'
import { WavStreamWriter } from './wav-writer'
import type { AudioFileInfo, RecordingMeta } from '@shared/recording/meta'

const HEADER_SIZE = 44
const FRAMES_PER_CHUNK = 4096 // ~85ms @ 48kHz;够大减少 IPC/syscall 次数,够小不爆 RAM
const TARGET_SR = 48000
const TARGET_CH = 2
const TARGET_BITDEPTH = 16

interface OpenedTrack {
  handle: FileHandle
  channels: number // 实测 header 值(mic 可能 1 或 2,sys 通常 2)
  totalFrames: number
  position: number // frames 已消费
}

/** 打开 wav 文件,读 44-byte header 验 RIFF,返回 reader handle + frame 数。
 *  失败 / 文件不在 → null(调用方按"该路缺失"处理)。 */
async function openTrack(filePath: string): Promise<OpenedTrack | null> {
  let handle: FileHandle | undefined
  try {
    handle = await fs.open(filePath, 'r')
    const stat = await handle.stat()
    if (stat.size < HEADER_SIZE) {
      await handle.close()
      return null
    }
    const header = Buffer.alloc(HEADER_SIZE)
    await handle.read(header, 0, HEADER_SIZE, 0)
    if (header.subarray(0, 4).toString('ascii') !== 'RIFF') {
      await handle.close()
      throw new Error(`not RIFF: ${filePath}`)
    }
    const channels = header.readUInt16LE(22)
    const bitDepth = header.readUInt16LE(34)
    if (bitDepth !== 16) {
      await handle.close()
      throw new Error(`unsupported bitDepth ${bitDepth}: ${filePath}`)
    }
    const dataBytes = stat.size - HEADER_SIZE
    const frameBytes = channels * 2 // s16le
    const totalFrames = Math.floor(dataBytes / frameBytes)
    return { handle, channels, totalFrames, position: 0 }
  } catch (e) {
    if (handle) {
      await handle.close().catch(() => {})
    }
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
}

/** 从 track 读最多 maxFrames 帧;返回的 Int16Array length = frames × channels */
async function readFrames(track: OpenedTrack, maxFrames: number): Promise<Int16Array> {
  const wantFrames = Math.min(maxFrames, track.totalFrames - track.position)
  if (wantFrames <= 0) return new Int16Array(0)
  const frameBytes = track.channels * 2
  const buf = Buffer.alloc(wantFrames * frameBytes)
  const offset = HEADER_SIZE + track.position * frameBytes
  const { bytesRead } = await track.handle.read(buf, 0, buf.length, offset)
  const validFrames = Math.floor(bytesRead / frameBytes)
  track.position += validFrames
  // Int16Array 视图直接复用 Buffer 底层(LE on macOS/Win x64/arm64,与 WAV s16le 一致)
  return new Int16Array(buf.buffer, buf.byteOffset, validFrames * track.channels)
}

function clamp16(v: number): number {
  return v > 32767 ? 32767 : v < -32768 ? -32768 : v
}

/** 把 partial meta 合到磁盘 meta(读最新 → merge → 写)。
 *  T14 阶段 main 进程串行,没有并发 patch 风险;并发出现再加 lock。 */
async function patchMeta(recordingId: string, patch: Partial<RecordingMeta>): Promise<void> {
  const m = await readMeta(recordingId)
  if (!m) throw new Error(`patchMeta: no meta for ${recordingId}`)
  await writeMeta({ ...m, ...patch })
}

/** 在 warnings 数组追加一条(读最新 → append → 写) */
async function appendWarning(recordingId: string, code: string, detail?: unknown): Promise<void> {
  const m = await readMeta(recordingId)
  if (!m) return
  const warnings = [...(m.warnings ?? []), { code, at: Date.now(), detail }]
  await writeMeta({ ...m, warnings })
}

/** 主入口:读 meta → mixStatus=running → 流式 mix → 写 audioFiles.mixed + mixStatus=done。
 *  失败 → mixStatus=failed + warnings.push('mix-failed');不抛(fire-and-forget 调用)。 */
export async function runMixdown(recordingId: string): Promise<void> {
  const meta = await readMeta(recordingId)
  if (!meta) {
    logger.warn(`[mixer] no meta for ${recordingId}, skip`)
    return
  }
  const hasMic = !!meta.audioFiles.mic
  const hasSys = !!meta.audioFiles.system
  if (!hasMic && !hasSys) {
    await patchMeta(recordingId, { mixStatus: 'skipped' })
    logger.info(`[mixer] ${recordingId} skipped: no source tracks`)
    return
  }

  await patchMeta(recordingId, { mixStatus: 'running' })

  const mixedPath = getMixedFilePath(recordingId)
  const writer = new WavStreamWriter({
    filePath: mixedPath,
    sampleRate: TARGET_SR,
    channels: TARGET_CH,
    bitDepth: TARGET_BITDEPTH,
  })
  let mic: OpenedTrack | null = null
  let sys: OpenedTrack | null = null
  let processed = 0

  try {
    await writer.open()
    if (hasMic) mic = await openTrack(getAudioFilePath(recordingId, 'mic'))
    if (hasSys) sys = await openTrack(getAudioFilePath(recordingId, 'system'))
    if (!mic && !sys) {
      throw new Error('all source tracks failed to open')
    }

    const micFrames = mic?.totalFrames ?? 0
    const sysFrames = sys?.totalFrames ?? 0
    const totalFrames = mic && sys ? Math.min(micFrames, sysFrames) : Math.max(micFrames, sysFrames)

    if (mic && sys) {
      const diff = Math.abs(micFrames - sysFrames)
      const diffMs = (diff / TARGET_SR) * 1000
      if (diffMs > 1) {
        // > 1ms 偏差登记 warning(spike-005 在 M2 上 < 21μs / 12s,1ms 已显著)
        logger.warn(
          `[mixer] ${recordingId} length mismatch: mic=${micFrames} sys=${sysFrames} ` +
            `diff=${diff} frames (~${diffMs.toFixed(1)}ms);trimming to min`,
        )
      }
    }

    const out = new Int16Array(FRAMES_PER_CHUNK * TARGET_CH)

    while (processed < totalFrames) {
      const want = Math.min(FRAMES_PER_CHUNK, totalFrames - processed)
      const micSamples = mic ? await readFrames(mic, want) : new Int16Array(0)
      const sysSamples = sys ? await readFrames(sys, want) : new Int16Array(0)
      const actualMicFrames = mic ? micSamples.length / mic.channels : 0
      const actualSysFrames = sys ? sysSamples.length / sys.channels : 0
      // 取本批两路实际读到的 min(防 EOF 时取到不全的帧)
      const actual =
        mic && sys
          ? Math.min(actualMicFrames, actualSysFrames)
          : Math.max(actualMicFrames, actualSysFrames)
      const frames = Math.min(want, actual)
      if (frames === 0) break

      for (let i = 0; i < frames; i++) {
        let mL = 0
        let mR = 0
        let sL = 0
        let sR = 0
        if (mic) {
          if (mic.channels === 1) {
            const s = micSamples[i] ?? 0
            mL = s
            mR = s
          } else {
            mL = micSamples[i * 2] ?? 0
            mR = micSamples[i * 2 + 1] ?? 0
          }
        }
        if (sys) {
          if (sys.channels === 1) {
            const s = sysSamples[i] ?? 0
            sL = s
            sR = s
          } else {
            sL = sysSamples[i * 2] ?? 0
            sR = sysSamples[i * 2 + 1] ?? 0
          }
        }
        let L: number
        let R: number
        if (mic && sys) {
          // 双源:平均,避免削顶
          L = clamp16(Math.round((mL + sL) / 2))
          R = clamp16(Math.round((mR + sR) / 2))
        } else if (mic) {
          // 单源:直接 stereo 化,不平均(否则音量减半)
          L = mL
          R = mR
        } else {
          L = sL
          R = sR
        }
        out[i * 2] = L
        out[i * 2 + 1] = R
      }
      const buf = Buffer.from(out.buffer, out.byteOffset, frames * TARGET_CH * 2)
      await writer.write(buf)
      processed += frames
    }

    await writer.close()

    const bytes = writer.getBytesWritten()
    const mixedInfo: AudioFileInfo = {
      path: 'mixed.wav',
      codec: 'wav-pcm-s16le',
      sampleRate: TARGET_SR,
      channels: TARGET_CH,
      bitDepth: TARGET_BITDEPTH,
      bytes,
    }
    const cur = await readMeta(recordingId)
    if (cur) {
      await writeMeta({
        ...cur,
        audioFiles: { ...cur.audioFiles, mixed: mixedInfo },
        mixStatus: 'done',
      })
    }
    logger.info(
      `[mixer] ${recordingId} done: ${processed} frames, ${bytes} bytes ` +
        `(mic=${hasMic ? mic?.totalFrames : '—'}, sys=${hasSys ? sys?.totalFrames : '—'})`,
    )
  } catch (e) {
    logger.error(`[mixer] ${recordingId} failed at frame ${processed}: ${String(e)}`)
    try {
      await writer.close().catch(() => {})
    } catch {
      /* writer 可能从没 open 成功 */
    }
    // 残留 mixed.wav 删掉(避免半文件迷惑用户)
    await fs.unlink(mixedPath).catch(() => {})
    await patchMeta(recordingId, { mixStatus: 'failed' }).catch((err) =>
      logger.error(`[mixer] patch mixStatus=failed also failed: ${String(err)}`),
    )
    await appendWarning(recordingId, 'mix-failed', String(e)).catch(() => {})
  } finally {
    if (mic) await mic.handle.close().catch(() => {})
    if (sys) await sys.handle.close().catch(() => {})
  }
}
