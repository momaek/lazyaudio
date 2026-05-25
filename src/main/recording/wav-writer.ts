// T13 — WavStreamWriter
//
// 设计来源:audio-capture.md §5.1 / §5.2
//
// 行为:
// 1. open():fs.open + 写 44-byte WAV header 占位(RIFF size / data size 写 0)
// 2. write(int16):fs.write append,bytesWritten 累计,**不缓存到 RAM**
// 3. 每 30s setInterval 调 flushHeader():pwrite RIFF size(offset 4) +
//    data size(offset 40),让"已落盘部分大部分时间立即可播放"(audio-capture §5.1 注解)
// 4. close():final flushHeader + fs.close + clearInterval
//
// 崩溃恢复(T15a 实施):header 落后 ≤ 30s,但 PCM 字节完整;扫描时反推真实文件大小
// 回填 header 即可恢复完整可播。T13 不做扫描,仅保证 flush 间隔可恢复。

import fs from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { logger } from '../logger'

const HEADER_FLUSH_INTERVAL_MS = 30_000
const HEADER_SIZE = 44

export class WavWriterError extends Error {
  constructor(
    message: string,
    public readonly path: string,
    public override readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'WavWriterError'
  }
}

export interface WavStreamWriterOpts {
  filePath: string
  sampleRate: number // 48000
  channels: number // 1 (mic) / 2 (system)
  bitDepth?: number // 16
}

export class WavStreamWriter {
  readonly filePath: string
  readonly sampleRate: number
  readonly channels: number
  readonly bitDepth: number

  private handle: FileHandle | null = null
  private bytesWritten = 0 // PCM data bytes(不含 header)
  private flushTimer: NodeJS.Timeout | null = null
  private closed = false

  constructor(opts: WavStreamWriterOpts) {
    this.filePath = opts.filePath
    this.sampleRate = opts.sampleRate
    this.channels = opts.channels
    this.bitDepth = opts.bitDepth ?? 16
  }

  /** 打开文件 + 写 44-byte header 占位(size 字段写 0,close 时 flushHeader 回填) */
  async open(): Promise<void> {
    if (this.handle) return
    try {
      this.handle = await fs.open(this.filePath, 'w')
      // 关键:不传 position(默认从 current position=0 写,**并推进 file position 到 44**)。
      // 如果传 position=0 显式 pwrite,file position 不动,后续 chunk write 会从 0 覆盖 header。
      await this.handle.write(this.makeHeader(0), 0, HEADER_SIZE)
      // 30s 周期 flush — 让 Audacity / VLC / Finder 在录音中也能播
      this.flushTimer = setInterval(() => {
        void this.flushHeader().catch((e) => {
          logger.warn(`[wav] periodic flushHeader failed: ${String(e)}`, { path: this.filePath })
        })
      }, HEADER_FLUSH_INTERVAL_MS)
    } catch (e) {
      throw new WavWriterError('open failed', this.filePath, e)
    }
  }

  /** append PCM(Int16);可传 ArrayBuffer / Buffer / Uint8Array */
  async write(pcm: ArrayBuffer | Buffer | Uint8Array): Promise<void> {
    if (this.closed) throw new WavWriterError('write after close', this.filePath)
    if (!this.handle) throw new WavWriterError('write before open', this.filePath)
    const buf =
      pcm instanceof Buffer
        ? pcm
        : pcm instanceof ArrayBuffer
          ? Buffer.from(pcm)
          : Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    try {
      const { bytesWritten } = await this.handle.write(buf, 0, buf.byteLength)
      this.bytesWritten += bytesWritten
    } catch (e) {
      throw new WavWriterError('write failed', this.filePath, e)
    }
  }

  /** pwrite 回填 RIFF size(offset 4) + data size(offset 40) */
  async flushHeader(): Promise<void> {
    if (!this.handle) return
    const riffSize = 36 + this.bytesWritten // RIFF chunk size = 总大小 - 8
    const dataSize = this.bytesWritten

    const riffSizeBuf = Buffer.alloc(4)
    riffSizeBuf.writeUInt32LE(riffSize, 0)
    await this.handle.write(riffSizeBuf, 0, 4, 4)

    const dataSizeBuf = Buffer.alloc(4)
    dataSizeBuf.writeUInt32LE(dataSize, 0)
    await this.handle.write(dataSizeBuf, 0, 4, 40)
  }

  /** 最终回填 header + close;close 后再 write 抛错 */
  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
    if (!this.handle) return
    try {
      await this.flushHeader()
      await this.handle.close()
    } catch (e) {
      throw new WavWriterError('close failed', this.filePath, e)
    } finally {
      this.handle = null
    }
  }

  getBytesWritten(): number {
    return this.bytesWritten
  }

  /** 构造 44-byte WAV header(audio-capture §5.2)*/
  private makeHeader(dataSize: number): Buffer {
    const buf = Buffer.alloc(HEADER_SIZE)
    const byteRate = this.sampleRate * this.channels * (this.bitDepth / 8)
    const blockAlign = this.channels * (this.bitDepth / 8)
    // RIFF header
    buf.write('RIFF', 0, 4, 'ascii')
    buf.writeUInt32LE(36 + dataSize, 4) // 总大小 - 8;open 时 dataSize=0,后续 pwrite 回填
    buf.write('WAVE', 8, 4, 'ascii')
    // fmt chunk
    buf.write('fmt ', 12, 4, 'ascii')
    buf.writeUInt32LE(16, 16) // fmt chunk size (PCM)
    buf.writeUInt16LE(1, 20) // PCM format
    buf.writeUInt16LE(this.channels, 22)
    buf.writeUInt32LE(this.sampleRate, 24)
    buf.writeUInt32LE(byteRate, 28)
    buf.writeUInt16LE(blockAlign, 32)
    buf.writeUInt16LE(this.bitDepth, 34)
    // data chunk
    buf.write('data', 36, 4, 'ascii')
    buf.writeUInt32LE(dataSize, 40) // open 时 0,后续 pwrite 回填
    return buf
  }
}
