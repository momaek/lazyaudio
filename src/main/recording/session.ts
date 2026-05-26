// T13 — RecordingSession:每个 recordingId 一个,持 writers + meta
//
// 生命周期:
// 1. start({id, sessionType, sources, title, startedAt}):
//    - mkdir -p recordings/{id}/
//    - 写 initial meta(status='recording', audioFiles={})
// 2. openTrackWriter(trackId, sampleRate, channels, bitDepth):
//    - 创建并 open WavStreamWriter(filePath = mic.wav / system.wav)
//    - 更新 meta.audioFiles.{trackId}(bytes=0,close 时回填)
// 3. writeTrack(trackId, pcm):
//    - 转发给对应 writer.write
// 4. closeTrack(trackId, reason):
//    - writer.close,回填 meta.audioFiles.{trackId}.bytes
// 5. stop():
//    - 全 close,finalize meta(endedAt + durationMs + status='done' / 'failed-partial')
//    - 已结束的 session 不能再用
//
// receiver(T12)在 chunk message 时同步调 writeTrack;writeTrack 是 async 但不 await
// (chunk 频率 100ms × 2 路 = 20/sec,await 串行化会拖延 IPC;Node FS append 一般快,
// 实测瓶颈不在这。如果将来观察到背压再加 ring buffer + drain)。

import type { TrackId } from '@shared/audio/messages'
import type { SessionType, Sources } from '@shared/ipc/record'
import type { RecordingMeta, AudioFileInfo } from '@shared/recording/meta'
import { logger } from '../logger'
import { WavStreamWriter } from './wav-writer'
import { writeMeta, makeInitialMeta } from './meta-store'
import { ensureRecordingDir, getAudioFilePath } from './paths'

export interface StartSessionArgs {
  id: string
  title: string
  sessionType: SessionType
  sources: Sources
  startedAt: number
}

interface TrackEntry {
  writer: WavStreamWriter
  sampleRate: number
  channels: number
  bitDepth: number
  /** open() 还没完成时,write 会 await 此 promise;完成后 = null */
  openPromise: Promise<void> | null
}

export class RecordingSession {
  readonly id: string
  readonly startedAt: number
  private meta: RecordingMeta
  private tracks = new Map<TrackId, TrackEntry>()
  private stopped = false
  private pendingErrors: string[] = []

  private constructor(meta: RecordingMeta) {
    this.id = meta.id
    this.startedAt = meta.startedAt
    this.meta = meta
  }

  /** 工厂:mkdir + 写 initial meta + 返回 session */
  static async start(args: StartSessionArgs): Promise<RecordingSession> {
    await ensureRecordingDir(args.id)
    const meta = makeInitialMeta(args)
    await writeMeta(meta)
    const session = new RecordingSession(meta)
    logger.info(`[session] start ${args.id} (sources=${JSON.stringify(args.sources)})`)
    return session
  }

  /** 收到 track-open 时调:**同步**建 writer entry(让紧跟着的 writeTrack 立刻能找到),
   *  fs.open + header 占位在后台 await(openPromise);writeTrack 内会 await 此 promise
   *  确保 open 完成后再 write,避免错过开头几帧。 */
  openTrackWriter(trackId: TrackId, sampleRate: number, channels: number, bitDepth: number): void {
    if (this.stopped) {
      logger.warn(`[session] openTrackWriter after stop, ignored: ${trackId}`)
      return
    }
    if (this.tracks.has(trackId)) {
      logger.warn(`[session] openTrackWriter dup for ${trackId}, ignoring second open`)
      return
    }
    const filePath = getAudioFilePath(this.id, trackId)
    const writer = new WavStreamWriter({ filePath, sampleRate, channels, bitDepth })
    // 同步 set 进 map,后面 writeTrack 找得到;然后异步 open(writeTrack 会 await openPromise)
    const openPromise = writer
      .open()
      .catch((e) => {
        const msg = `wav open failed for ${trackId}: ${String(e)}`
        logger.error(`[session] ${msg}`)
        this.pendingErrors.push(msg)
      })
      .finally(() => {
        const entry = this.tracks.get(trackId)
        if (entry) entry.openPromise = null
      })
    this.tracks.set(trackId, { writer, sampleRate, channels, bitDepth, openPromise })
    const fileInfo: AudioFileInfo = {
      path: `${trackId}.wav`,
      codec: 'wav-pcm-s16le',
      sampleRate,
      channels,
      bitDepth,
      bytes: 0,
    }
    this.meta.audioFiles = { ...this.meta.audioFiles, [trackId]: fileInfo }
    // 不在这里 writeMeta:开 + 关 + stop 三处都写 meta 容易 .tmp rename 撞;
    // initial meta(start 时)+ final meta(stop 时)够用。崩溃恢复用 wav 文件大小反推。
  }

  /** 收到 chunk 时调:fs.write append 到对应 writer。
   *  若 writer.open() 还没完成(openPromise != null),先 await 它再 write — 这样
   *  在 track-open 紧接着第一帧 chunk 的 race 里也不会丢帧。 */
  async writeTrack(trackId: TrackId, pcm: ArrayBuffer): Promise<void> {
    const entry = this.tracks.get(trackId)
    if (!entry) {
      logger.warn(`[session] writeTrack: no writer for ${trackId}`)
      return
    }
    if (entry.openPromise) {
      await entry.openPromise
    }
    try {
      await entry.writer.write(pcm)
    } catch (e) {
      this.pendingErrors.push(`write ${trackId}: ${String(e)}`)
    }
  }

  /** 收到 track-close 时调:writer.close + 回填 meta.audioFiles.{trackId}.bytes */
  async closeTrack(trackId: TrackId, reason: string): Promise<void> {
    const entry = this.tracks.get(trackId)
    if (!entry) {
      logger.warn(`[session] closeTrack: no writer for ${trackId}`)
      return
    }
    try {
      await entry.writer.close()
    } catch (e) {
      this.pendingErrors.push(`close ${trackId}: ${String(e)}`)
    }
    const bytes = entry.writer.getBytesWritten()
    const existing = this.meta.audioFiles[trackId]
    if (existing) {
      this.meta.audioFiles = {
        ...this.meta.audioFiles,
        [trackId]: { ...existing, bytes },
      }
    }
    logger.info(`[session] closeTrack ${trackId} reason=${reason}, bytes=${bytes}`)
    // 不在这里 writeMeta:并发 closeTrack 同时调会让 .tmp rename 撞 ENOENT;
    // stop() 时统一写 final 包含 audioFiles.bytes 即可。
  }

  /** record:stop / 全 track close 后调:全 close + finalize meta(endedAt + durationMs + status) */
  async stop(): Promise<void> {
    if (this.stopped) return
    this.stopped = true
    // 残留 track 兜底 close
    for (const [trackId, entry] of this.tracks) {
      if (entry.writer) {
        try {
          await entry.writer.close()
          const bytes = entry.writer.getBytesWritten()
          const existing = this.meta.audioFiles[trackId]
          if (existing) {
            this.meta.audioFiles[trackId] = { ...existing, bytes }
          }
        } catch (e) {
          this.pendingErrors.push(`stop close ${trackId}: ${String(e)}`)
        }
      }
    }
    const endedAt = Date.now()
    this.meta.endedAt = endedAt
    this.meta.durationMs = endedAt - this.startedAt
    if (this.pendingErrors.length > 0) {
      this.meta.status = 'failed-partial'
      this.meta.failedReason = this.pendingErrors.join('; ')
    } else {
      this.meta.status = 'done'
    }
    // T14:mixStatus 初始态。两路都无 → skipped(没东西可混);否则 pending,
    // 由调用方 fire-and-forget 调 runMixdown(id) 推进 → running → done/failed。
    const hasAnyAudio = !!this.meta.audioFiles.mic || !!this.meta.audioFiles.system
    this.meta.mixStatus = hasAnyAudio ? 'pending' : 'skipped'
    try {
      await writeMeta(this.meta)
      logger.info(
        `[session] stop ${this.id} status=${this.meta.status} duration=${this.meta.durationMs}ms`,
      )
    } catch (e) {
      logger.error(`[session] writeMeta(final) failed: ${String(e)}`)
    }
  }

  /** capture / writer 致命失败时调:记录失败原因后走 stop(),让 meta 标 failed-partial。 */
  async fail(reason: string): Promise<void> {
    this.pendingErrors.push(reason)
    await this.stop()
  }

  isStopped(): boolean {
    return this.stopped
  }

  getMeta(): Readonly<RecordingMeta> {
    return this.meta
  }
}
