// T34 — 实时 PCM fork:从 receiver tap 原始 48k Int16(按 track-open 声明的通道数)→
// 各自下混 mono、48k→16k、按时间对齐相加成一路 → 喂 Pass A(orchestrator.pushLivePcm)。
// 只在 live 会话 active 时工作;fork 失败不影响 WAV 落盘(receiver 那边独立)。
//
// v0.1 简化:mic+system 相加裁剪成一路(speaker='mixed')。两轨各维护 16k mono 队列,
// 取 min 长度对齐相加;若一轨长时间无数据(如系统音没权限),退化成另一轨单独喂。

import { int16ToMonoFloat32, resampleLinear, float32ToInt16 } from './dsp'
import { isLiveActive, pushLivePcm } from '../transcribe/orchestrator'

const SRC_RATE = 48_000
const DST_RATE = 16_000
const STALL_SAMPLES = DST_RATE * 2 // 一轨积压 >2s 而另一轨空 → 不再等,单独喂

interface Mixer {
  recordingId: string
  micEnabled: boolean
  sysEnabled: boolean
  mic: Float32Array[]
  sys: Float32Array[]
  channels: Partial<Record<'mic' | 'system', number>>
}
let mixer: Mixer | null = null

export function startPcmFork(
  recordingId: string,
  sources: { mic: boolean; system: boolean },
): void {
  mixer = {
    recordingId,
    micEnabled: sources.mic,
    sysEnabled: sources.system,
    mic: [],
    sys: [],
    channels: {},
  }
}

export function stopPcmFork(recordingId: string): void {
  if (mixer?.recordingId === recordingId) mixer = null
}

export function registerPcmTrack(
  recordingId: string,
  trackId: 'mic' | 'system',
  channels: number,
): void {
  const mx = mixer
  if (!mx || mx.recordingId !== recordingId) return
  mx.channels[trackId] = channels
}

/** receiver 每来一块原始 Int16(48k interleaved)调这里 */
export function forkPcm(recordingId: string, trackId: 'mic' | 'system', pcm: ArrayBuffer): void {
  const mx = mixer
  if (!mx || mx.recordingId !== recordingId) return
  if (!isLiveActive(recordingId)) return // live 还没起来 / 已停 → 丢弃,避免无界积压

  const channels = mx.channels[trackId]
  if (!channels || channels <= 0) return
  const mono48 = int16ToMonoFloat32(new Int16Array(pcm), channels)
  const mono16 = resampleLinear(mono48, SRC_RATE, DST_RATE)
  if (trackId === 'mic') mx.mic.push(mono16)
  else mx.sys.push(mono16)
  drain(mx)
}

function totalLen(q: Float32Array[]): number {
  let n = 0
  for (const a of q) n += a.length
  return n
}

function take(q: Float32Array[], n: number): Float32Array {
  const out = new Float32Array(n)
  let filled = 0
  while (filled < n && q.length > 0) {
    const head = q[0]!
    const need = n - filled
    if (head.length <= need) {
      out.set(head, filled)
      filled += head.length
      q.shift()
    } else {
      out.set(head.subarray(0, need), filled)
      q[0] = head.subarray(need)
      filled += need
    }
  }
  return out
}

function drain(mx: Mixer): void {
  let mixMic = mx.micEnabled
  let mixSys = mx.sysEnabled
  const lm = totalLen(mx.mic)
  const ls = totalLen(mx.sys)

  let n: number
  if (mixMic && mixSys) {
    if (lm > 0 && ls > 0) {
      n = Math.min(lm, ls)
    } else if (Math.max(lm, ls) > STALL_SAMPLES) {
      // 一轨长时间无数据 → 退化成另一轨单独喂
      if (lm >= ls) {
        n = lm
        mixSys = false
      } else {
        n = ls
        mixMic = false
      }
    } else {
      return // 等两轨都有数据
    }
  } else if (mixMic) {
    n = lm
  } else if (mixSys) {
    n = ls
  } else {
    return
  }
  if (n <= 0) return

  const m = mixMic ? take(mx.mic, n) : null
  const s = mixSys ? take(mx.sys, n) : null
  const mixed = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let v = 0
    if (m) v += m[i] ?? 0
    if (s) v += s[i] ?? 0
    mixed[i] = v < -1 ? -1 : v > 1 ? 1 : v
  }
  pushLivePcm(mx.recordingId, float32ToInt16(mixed))
}
