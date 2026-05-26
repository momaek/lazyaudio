// T12 — dev-only autotest:无 GUI 触发 record:start / stop,验"main 收到字节数 ≈ 时长 × 48k × 2"。
//
// 用途:CI 跑不了 Electron(需 display);本地 dev 远程 session 也没法点 GUI。
// 加这个 hook 让 LAZY_AUTOTEST=1 时启动后:
//   t=5s: 模拟 record:start(mic + system 全开)→ capture window 启 capture
//   t=15s: 模拟 record:stop → capture stop + receiver log 总字节
//   t=17s: app.quit(),让 dev process 优雅退出
//
// 实际产品流程仍走 prep 浮窗 + record:start IPC。autotest 直接调内部 fn,绕开 IPC。
// 仅 dev 期 / LAZY_AUTOTEST=1 启用,默认行为不受影响。

import { app } from 'electron'
import fs from 'node:fs/promises'
import { AUDIO } from '@shared/ipc/channels'
import { logger } from '../logger'
import {
  getStatus,
  transitionToRecording,
  transitionToIdle,
  getRecorderState,
} from './recorder-state'
import { getCaptureWindow } from '../windows/capture-window'
import { RecordingSession } from '../recording/session'
import { getCurrentSession, setCurrentSession } from '../recording'
import { getRecordingDir, getAudioFilePath } from '../recording/paths'
import { readMeta } from '../recording/meta-store'

const ENABLED = process.env['LAZY_AUTOTEST'] === '1'
const START_DELAY_MS = 5000 // app ready 后等 5s 再启 capture(给 capture window load + port handshake)
const CAPTURE_DURATION_MS = 10000 // 录 10s
const POST_STOP_DELAY_MS = 2000 // stop 后再等 2s 看 receiver log,然后退

export function maybeRunAutotest(): void {
  if (!ENABLED) return

  logger.info('[autotest] LAZY_AUTOTEST=1 detected; will start capture in 5s, stop after 10s')

  setTimeout(() => {
    void (async () => {
      if (getStatus() !== 'idle') {
        logger.error('[autotest] expected idle, got', { status: getStatus() })
        return
      }
      const state = transitionToRecording({
        sessionType: 'general',
        sources: { mic: true, system: true },
      })
      const captureWin = getCaptureWindow()
      if (!captureWin) {
        logger.error('[autotest] capture window not ready')
        transitionToIdle()
        return
      }
      // T13:autotest 也走 RecordingSession 真实路径(等同 record:start handler)
      try {
        const session = await RecordingSession.start({
          id: state.recordingId!,
          title: '通用 autotest',
          sessionType: 'general',
          sources: { mic: true, system: true },
          startedAt: state.startedAt!,
        })
        setCurrentSession(session)
      } catch (e) {
        logger.error(`[autotest] session.start failed: ${String(e)}`)
        transitionToIdle()
        return
      }

      captureWin.webContents.send(AUDIO.startCapture, {
        recordingId: state.recordingId,
        sources: { mic: true, system: true },
      })
      logger.info('[autotest] sent startCapture', { recordingId: state.recordingId })

      setTimeout(() => {
        void (async () => {
          const before = getRecorderState()
          const captureWin2 = getCaptureWindow()
          if (captureWin2 && before.recordingId) {
            captureWin2.webContents.send(AUDIO.stopCapture, { recordingId: before.recordingId })
          }
          logger.info('[autotest] sent stopCapture', { recordingId: before.recordingId })

          // 等 capture renderer teardown + session.stop 完成
          await new Promise((r) => setTimeout(r, 300))
          const session = getCurrentSession()
          if (session) {
            await session
              .stop()
              .catch((e) => logger.error(`[autotest] session.stop failed: ${String(e)}`))
            setCurrentSession(null)
          }
          transitionToIdle()

          // T13 验:wav 文件存在 + size 合理 + meta.status=done
          if (before.recordingId) {
            const id = before.recordingId
            const dir = getRecordingDir(id)
            const micPath = getAudioFilePath(id, 'mic')
            const sysPath = getAudioFilePath(id, 'system')
            try {
              const micStat = await fs.stat(micPath)
              const sysStat = await fs.stat(sysPath)
              const meta = await readMeta(id)
              logger.info(`[autotest] post-stop check:`)
              logger.info(`  dir:       ${dir}`)
              logger.info(`  mic.wav:   ${micStat.size} bytes`)
              logger.info(`  system.wav: ${sysStat.size} bytes`)
              logger.info(
                `  meta:      status=${meta?.status} durationMs=${meta?.durationMs} ` +
                  `mic.bytes=${meta?.audioFiles.mic?.bytes} sys.bytes=${meta?.audioFiles.system?.bytes}`,
              )
            } catch (e) {
              logger.error(`[autotest] post-stop fs check failed: ${String(e)}`)
            }
          }

          setTimeout(() => {
            logger.info('[autotest] done; quitting')
            app.quit()
          }, POST_STOP_DELAY_MS)
        })()
      }, CAPTURE_DURATION_MS)
    })()
  }, START_DELAY_MS)
}
