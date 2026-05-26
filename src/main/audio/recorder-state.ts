// T12 — 最小录音状态机。
//
// 范围(T12):仅 idle / preparing / recording / stopping 四态;不含 paused(留 T17)
// + 不广播 record:state-changed 事件(留 T13/T17 接 renderer 观察者后再开)。
//
// 用途:
// - shortcut handler 判断 ⌘⇧R 按下时分叉(idle → show prep / recording → stop)
// - record:start / record:stop IPC handler 拿当前 recordingId
// - 防重(已 recording 时再调 start 报错)

import { ulid } from 'ulid'
import type { SessionType, Sources } from '@shared/ipc/record'

export type RecorderStatus = 'idle' | 'preparing' | 'recording' | 'stopping'

export interface RecorderState {
  status: RecorderStatus
  recordingId: string | null
  sessionType: SessionType | null
  sources: Sources | null
  startedAt: number | null // ms epoch
}

let state: RecorderState = {
  status: 'idle',
  recordingId: null,
  sessionType: null,
  sources: null,
  startedAt: null,
}

export function getRecorderState(): Readonly<RecorderState> {
  return state
}

export function getStatus(): RecorderStatus {
  return state.status
}

/**
 * idle → preparing → recording:T12 阶段 preparing 几乎瞬间过(没有真实预热),
 * 这里一步到 recording。T13 接 wav writer 后,preparing 才有 "writers 已创建,
 * 等第一帧 PCM" 的语义(overview §4.2)。
 */
export function transitionToRecording(args: {
  sessionType: SessionType
  sources: Sources
}): RecorderState {
  if (state.status !== 'idle') {
    throw new Error(`cannot start: current status = ${state.status}`)
  }
  state = {
    status: 'recording',
    // ULID (data-model §1.2):26 字符,前 10 字符是 ms 时间戳 base32,按目录名排 = 按创建时间排
    recordingId: ulid(),
    sessionType: args.sessionType,
    sources: args.sources,
    startedAt: Date.now(),
  }
  return state
}

/**
 * recording → stopping → idle:T12 阶段也是一步过(没有真实 writer flush 等待)。
 * T13 后 stopping 等 wav writer.close 完成。
 */
export function transitionToIdle(): RecorderState {
  if (state.status === 'idle') {
    return state // 重复 stop 是 no-op,不抛
  }
  state = {
    status: 'idle',
    recordingId: null,
    sessionType: null,
    sources: null,
    startedAt: null,
  }
  return state
}
