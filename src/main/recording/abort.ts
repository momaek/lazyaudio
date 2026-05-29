// T17 — 中断当前录音(非用户主动 stop):capture renderer 崩溃 / 退出确认时调。
//
// 与 record.ts 的 failCurrentRecording(capture-failed 路径,带 recordingId 校验)区别:
// 这里不关心是哪个 recordingId,直接把"当前 active session"flush + 标 failed-partial。
// 走 session.fail → stop(close writers + 写 final meta,status=failed-partial),
// 已落盘部分保留可播(配合 T15a 恢复扫描)。

import { getCurrentSession, setCurrentSession } from './index'
import { purgeRecordingTracks } from '../audio/receiver'
import { transitionToIdle } from '../audio/recorder-state'
import { broadcastRecorderState } from '../audio/recorder-broadcast'
import { logger } from '../logger'

export async function failActiveRecording(reason: string): Promise<void> {
  const session = getCurrentSession()
  if (!session) {
    logger.warn(`failActiveRecording: no active session (${reason})`)
    return
  }
  const recordingId = session.id
  await session.fail(reason).catch((e) => {
    logger.error(`failActiveRecording: session.fail failed: ${String(e)}`)
  })
  setCurrentSession(null)
  purgeRecordingTracks(recordingId)
  transitionToIdle()
  broadcastRecorderState()
  logger.warn('active recording aborted → failed-partial → idle', { recordingId, reason })
}
