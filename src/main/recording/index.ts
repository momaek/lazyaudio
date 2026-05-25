// T13 — current RecordingSession 共享(被 receiver / ipc/record 引)
//
// 简单的 module-level singleton:同一时刻只有一个 active session(配合 recorder-state
// 的 idle/recording 互斥);start 后存,stop 后清。

import type { RecordingSession } from './session'

let current: RecordingSession | null = null

export function setCurrentSession(s: RecordingSession | null): void {
  current = s
}

export function getCurrentSession(): RecordingSession | null {
  return current
}
