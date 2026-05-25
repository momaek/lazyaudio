// T12 — main 端收 capture renderer 通过 MessagePort 推过来的 PCM 流。
//
// 范围(T12):
// - 收 track-open / chunk / track-close,按 trackId 累计 bytesReceived
// - 定期 log 字节数(每 1s)+ 回 writer-ack(让 renderer 端 sanity)
// - **不写 WAV**(T13 接 wav writer 后,这里 fork 一份给 writer)
//
// 关键(audio-capture §4.2):chunk.pcm 是 ArrayBuffer,transferable 零拷贝;不要 copy。

import type { MessagePortMain } from 'electron'
import type { TrackId } from '@shared/audio/messages'
import { logger } from '../logger'
import { onAudioPortReady } from './port'
import { getCurrentSession } from '../recording'

type TrackStat = {
  recordingId: string
  trackId: TrackId
  sampleRate: number
  channels: number
  bitDepth: number
  bytesReceived: number
  chunksReceived: number
  lastSeq: number
  openedAtMs: number
}

// recordingId+trackId → stat;recording 跨多个 track 累积
const tracks = new Map<string, TrackStat>()
let tickTimer: NodeJS.Timeout | null = null

function trackKey(recordingId: string, trackId: TrackId): string {
  return `${recordingId}:${trackId}`
}

function logTick(): void {
  if (tracks.size === 0) return
  for (const stat of tracks.values()) {
    const elapsedSec = (Date.now() - stat.openedAtMs) / 1000
    const expected = elapsedSec * stat.sampleRate * stat.channels * (stat.bitDepth / 8)
    const drift = stat.bytesReceived - expected
    logger.info(
      `[audio] ${stat.trackId}: ${stat.chunksReceived} chunks, ${stat.bytesReceived} bytes / ` +
        `${elapsedSec.toFixed(1)}s @ ${stat.sampleRate}Hz × ${stat.channels}ch × ${stat.bitDepth}bit ` +
        `(expected ${Math.round(expected)}, drift ${Math.round(drift)})`,
    )
  }
}

function startTickIfNeeded(): void {
  if (tickTimer) return
  tickTimer = setInterval(logTick, 1000)
}

function stopTickIfNoTracks(): void {
  if (tracks.size === 0 && tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
}

function handleMessage(port: MessagePortMain, raw: unknown): void {
  // raw 是 { type, ... };pcm 字段在 chunk 类型里是 ArrayBuffer transferable
  // 不跑 zod parse(每秒 10 帧 × 2 路,parse 开销可能可见);仅 type-switch
  const msg = raw as
    | {
        type: 'track-open'
        recordingId: string
        trackId: TrackId
        sampleRate: number
        channels: number
        bitDepth: number
      }
    | {
        type: 'chunk'
        recordingId: string
        trackId: TrackId
        seq: number
        pcm: ArrayBuffer
        ts: number
      }
    | { type: 'track-close'; recordingId: string; trackId: TrackId; reason: string }

  if (!msg || typeof msg !== 'object' || !('type' in msg)) {
    logger.warn('[audio] unknown port msg', { raw })
    return
  }

  if (msg.type === 'track-open') {
    const key = trackKey(msg.recordingId, msg.trackId)
    if (tracks.has(key)) {
      logger.warn(`[audio] track-open dup for ${key}, replacing`)
    }
    tracks.set(key, {
      recordingId: msg.recordingId,
      trackId: msg.trackId,
      sampleRate: msg.sampleRate,
      channels: msg.channels,
      bitDepth: msg.bitDepth,
      bytesReceived: 0,
      chunksReceived: 0,
      lastSeq: -1,
      openedAtMs: Date.now(),
    })
    logger.info(
      `[audio] track-open ${key} ${msg.sampleRate}Hz × ${msg.channels}ch × ${msg.bitDepth}bit`,
    )
    startTickIfNeeded()
    // T13:fork 给当前 session 让 WAV writer 接住这一路(同步建 entry,异步 open)
    const session = getCurrentSession()
    if (session && session.id === msg.recordingId) {
      session.openTrackWriter(msg.trackId, msg.sampleRate, msg.channels, msg.bitDepth)
    } else if (session) {
      logger.warn(
        `[audio] track-open for ${msg.recordingId} but current session is ${session.id}; ignoring`,
      )
    }
    return
  }

  if (msg.type === 'chunk') {
    const key = trackKey(msg.recordingId, msg.trackId)
    const stat = tracks.get(key)
    if (!stat) {
      logger.warn(`[audio] chunk before track-open for ${key} (seq ${msg.seq})`)
      return
    }
    stat.bytesReceived += msg.pcm.byteLength
    stat.chunksReceived++
    if (msg.seq !== stat.lastSeq + 1) {
      logger.warn(`[audio] seq gap on ${key}: expected ${stat.lastSeq + 1}, got ${msg.seq}`)
    }
    stat.lastSeq = msg.seq
    // T13:fork PCM 给 session.writeTrack(fire-and-forget;Node fs.write 一般够快)
    const session = getCurrentSession()
    if (session && session.id === msg.recordingId) {
      void session.writeTrack(msg.trackId, msg.pcm)
    }

    // 每 50 帧(~5s)回一次 ack;太频繁没必要(背压本来就够)
    if (stat.chunksReceived % 50 === 0) {
      port.postMessage({
        type: 'writer-ack',
        recordingId: stat.recordingId,
        trackId: stat.trackId,
        lastSeq: stat.lastSeq,
        bytesWritten: stat.bytesReceived,
      })
    }
    return
  }

  if (msg.type === 'track-close') {
    const key = trackKey(msg.recordingId, msg.trackId)
    const stat = tracks.get(key)
    if (!stat) {
      logger.warn(`[audio] track-close for unknown ${key}`)
      return
    }
    const elapsedSec = (Date.now() - stat.openedAtMs) / 1000
    const expected = elapsedSec * stat.sampleRate * stat.channels * (stat.bitDepth / 8)
    logger.info(
      `[audio] track-close ${key} reason=${msg.reason}; ` +
        `total ${stat.chunksReceived} chunks, ${stat.bytesReceived} bytes / ` +
        `${elapsedSec.toFixed(2)}s; expected ${Math.round(expected)}, ` +
        `drift ${Math.round(stat.bytesReceived - expected)} bytes ` +
        `(${(((stat.bytesReceived - expected) / expected) * 100).toFixed(2)}%)`,
    )
    tracks.delete(key)
    stopTickIfNoTracks()
    // T13:fork close 给 session
    const session = getCurrentSession()
    if (session && session.id === msg.recordingId) {
      void session.closeTrack(msg.trackId, msg.reason)
    }
    return
  }

  logger.warn('[audio] unhandled port msg type', { msg })
}

export function startAudioReceiver(): void {
  onAudioPortReady((port) => {
    logger.info('[audio] receiver attached to port')
    port.on('message', (event) => {
      handleMessage(port, event.data)
    })
  })
}

/** 测试/工具用:取某 recording 的所有 track 累计 */
export function getRecordingBytes(recordingId: string): {
  mic: number
  system: number
} {
  let mic = 0
  let system = 0
  for (const stat of tracks.values()) {
    if (stat.recordingId !== recordingId) continue
    if (stat.trackId === 'mic') mic = stat.bytesReceived
    else if (stat.trackId === 'system') system = stat.bytesReceived
  }
  return { mic, system }
}
