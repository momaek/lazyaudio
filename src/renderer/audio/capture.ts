// T12 — capture renderer 内的 audio 采集编排
//
// 设计来源:
// - audio-capture.md §3 渲染端管线
// - spike-005 (audio-only ScreenCaptureKit + AudioContext + 0-gain destination 强制 pump)
// - audio-capture.md §3.4 Float32 → Int16 在 worklet 里转,IPC 字节减半
//
// 每次 startCapture 创建一组资源(streams + ctx + worklet nodes),stopCapture 全 cleanup。

import type { TrackId } from '@shared/audio/messages'

// Vite 静态分析 new URL(... import.meta.url) 模式,自动把 worklet TS 单独 bundle
// 出 ES 模块 + 返回最终 URL(https://vitejs.dev/guide/assets.html#new-url-url-import-meta-url)。
// AudioWorklet.addModule 直接吃这个 URL。
const workletUrl = new URL('./worklets/pcm-tap.worklet.ts', import.meta.url).href

const SAMPLE_RATE = 48000

type PortTarget = {
  postMessage: (msg: unknown, transfer?: Transferable[]) => void
}

interface TrackHandle {
  trackId: TrackId
  stream: MediaStream
  src: MediaStreamAudioSourceNode
  node: AudioWorkletNode
  channels: number
  seq: number
  /** 是否已经向 main 发过 track-open(首帧到达时置 true);失败 teardown 时只对
   *  已 open 的 track 补发 track-close,避免 receiver 打 "track-close for unknown" 警告。 */
  trackOpened: boolean
}

export interface CaptureSession {
  recordingId: string
  ctx: AudioContext
  silentGain: GainNode
  tracks: TrackHandle[]
  port: PortTarget
}

let activeSession: CaptureSession | null = null

function log(...args: unknown[]): void {
  console.info('[capture]', ...args)
}

async function openMicStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      sampleRate: SAMPLE_RATE,
      channelCount: 1,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  })
}

async function openSystemStream(): Promise<MediaStream> {
  // spike-005 验过的纯 audio SCKit 路径:不要 video,renderer 这样请求,
  // main 端 setDisplayMediaRequestHandler 回 { audio: 'loopback' } 不带 video。
  // 关键:不要传 useSystemPicker: true(会被 TCC 短路)
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: false,
    audio: true,
  })
  // 防御:某些 macOS 版本 audio-only 拿到的 stream 没有 audio track
  if (stream.getAudioTracks().length === 0) {
    stream.getTracks().forEach((t) => t.stop())
    throw new Error('getDisplayMedia: no audio track (system loopback failed)')
  }
  return stream
}

async function attachTrack(
  ctx: AudioContext,
  silentGain: GainNode,
  port: PortTarget,
  trackId: TrackId,
  stream: MediaStream,
  recordingId: string,
): Promise<TrackHandle> {
  const src = ctx.createMediaStreamSource(stream)
  const node = new AudioWorkletNode(ctx, 'pcm-tap', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  })

  const handle: TrackHandle = {
    trackId,
    stream,
    src,
    node,
    channels: 0, // 首帧确定
    seq: 0,
    trackOpened: false,
  }

  node.port.onmessage = (e) => {
    const data = e.data as
      | {
          type: 'chunk'
          pcm: ArrayBuffer
          frames: number
          channels: number
          rms: number
          ts: number
        }
      | undefined
    if (!data || data.type !== 'chunk') return

    // 首帧拿到 channels 后发 track-open
    if (!handle.trackOpened) {
      handle.channels = data.channels
      port.postMessage({
        type: 'track-open',
        recordingId,
        trackId,
        sampleRate: SAMPLE_RATE,
        channels: data.channels,
        bitDepth: 16,
      })
      handle.trackOpened = true
      log(`track-open sent: ${trackId} ${SAMPLE_RATE}Hz × ${data.channels}ch`)
    }

    // chunk:**不要** transfer ArrayBuffer 给 MessagePortMain — Electron 的 transfer
    // 参数只接受 MessagePortMain[],传 ArrayBuffer 会让整个 message 静默丢失,main 端
    // 收到 event.data === null。这里走 structured clone(copy),性能上 1h 录音 ~2GB
    // 拷贝可接受;T13/T14 接 native 写盘后可换 Buffer.from 优化。
    port.postMessage({
      type: 'chunk',
      recordingId,
      trackId,
      seq: handle.seq++,
      pcm: data.pcm,
      ts: data.ts,
    })
  }

  src.connect(node)
  // 0-gain → destination 强制 Chromium 给 worklet pump audio(spike-005 验过的坑)
  node.connect(silentGain)

  return handle
}

export async function startCapture(args: {
  recordingId: string
  sources: { mic: boolean; system: boolean }
  port: PortTarget
}): Promise<void> {
  if (activeSession) {
    console.warn('[capture] startCapture called while session active; stopping prev first')
    await stopCapture()
  }

  if (!args.sources.mic && !args.sources.system) {
    throw new Error('startCapture: at least one of mic / system must be true')
  }

  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' })
  log(`AudioContext state(initial)=${ctx.state}, sampleRate=${ctx.sampleRate}`)
  if (ctx.state !== 'running') {
    await ctx.resume()
    log(`AudioContext state(after resume)=${ctx.state}`)
  }
  await ctx.audioWorklet.addModule(workletUrl)

  const silentGain = ctx.createGain()
  silentGain.gain.value = 0
  silentGain.connect(ctx.destination)

  const session: CaptureSession = {
    recordingId: args.recordingId,
    ctx,
    silentGain,
    tracks: [],
    port: args.port,
  }

  try {
    if (args.sources.mic) {
      const stream = await openMicStream()
      const handle = await attachTrack(ctx, silentGain, args.port, 'mic', stream, args.recordingId)
      session.tracks.push(handle)
    }
    if (args.sources.system) {
      const stream = await openSystemStream()
      const handle = await attachTrack(
        ctx,
        silentGain,
        args.port,
        'system',
        stream,
        args.recordingId,
      )
      session.tracks.push(handle)
    }
  } catch (e) {
    // 部分打开失败 → 全 teardown,抛
    // 关键:对已经发过 track-open 的 handle 必须补发 track-close,否则 main 端 receiver
    // 的 tracks map 会留孤儿条目(tick 日志一直打 "1 chunks 19200 bytes / Ns"),
    // session 的 WAV writer fd 也得等到 session.stop() 兜底才关。
    session.tracks.forEach((h) => {
      if (h.trackOpened) {
        try {
          args.port.postMessage({
            type: 'track-close',
            recordingId: args.recordingId,
            trackId: h.trackId,
            reason: 'error',
          })
        } catch (postErr) {
          console.warn('[capture] track-close on error path failed', postErr)
        }
      }
      h.node.port.onmessage = null
      h.node.disconnect()
      h.src.disconnect()
      h.stream.getTracks().forEach((t) => t.stop())
    })
    await ctx.close()
    throw e
  }

  activeSession = session
  log(`startCapture done: recordingId=${args.recordingId}, tracks=${session.tracks.length}`)
}

export async function stopCapture(): Promise<void> {
  const session = activeSession
  if (!session) {
    log('stopCapture: no active session')
    return
  }
  activeSession = null

  for (const handle of session.tracks) {
    try {
      handle.node.port.onmessage = null
      handle.node.disconnect()
      handle.src.disconnect()
      handle.stream.getTracks().forEach((t) => t.stop())
      session.port.postMessage({
        type: 'track-close',
        recordingId: session.recordingId,
        trackId: handle.trackId,
        reason: 'normal',
      })
    } catch (e) {
      console.warn('[capture] track teardown error', e)
    }
  }
  try {
    session.silentGain.disconnect()
    await session.ctx.close()
  } catch (e) {
    console.warn('[capture] ctx close error', e)
  }
  log(`stopCapture done: recordingId=${session.recordingId}`)
}

export function getActiveRecordingId(): string | null {
  return activeSession?.recordingId ?? null
}
