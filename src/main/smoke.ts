// T19 — CI / headless 启动 smoke。
//
// LAZY_SMOKE=1 时,app ready 后短暂等待(确认主窗口 / prep / capture window / tray
// 都创建完且没崩),再 app.quit() 优雅退出。用于 CI 的 build-mac job 验证 mac 平台
// app 能编译 + 启动不崩 —— 不录音(不碰音频设备 / TCC,CI 标准 runner 两者都没有)。
// signed + notarized + 录真实 PCM 的完整 smoke 留 T70(依赖打包链 + 签名 secrets)。

import { app } from 'electron'
import { logger } from './logger'
import { spawnAsrUtility } from './transcribe/offline/spawn'

const ENABLED = process.env['LAZY_SMOKE'] === '1'
// 给窗口 / tray 创建留点时间,确认启动阶段不崩再退
const QUIT_DELAY_MS = 3000

export function maybeRunSmoke(): void {
  if (!ENABLED) return
  logger.info('[smoke] LAZY_SMOKE=1 detected; verifying startup then quitting in 3s')
  setTimeout(() => {
    // 标记行(含 LAZY_SMOKE_OK):CI step 可 grep 这行确认启动 smoke 真的跑通,
    // 而不是恰好 3s 内因别的原因退出。electron-log 默认把 info 写 stdout。
    logger.info('[smoke] startup ok LAZY_SMOKE_OK, quitting')
    app.quit()
  }, QUIT_DELAY_MS)
}

// T30 — ASR 加载链 smoke。LAZY_ASR_SMOKE=1 时 fork asr utility 验证 require('sherpa-onnx-node')
// 成功(dev + ad-hoc packaged 共用同一路径),打标记行后退出。验 AC「dev/packaged 都能 require」。
const ASR_ENABLED = process.env['LAZY_ASR_SMOKE'] === '1'

export function maybeRunAsrSmoke(): void {
  if (!ASR_ENABLED) return
  logger.info(
    '[asr-smoke] LAZY_ASR_SMOKE=1 detected; forking asr utility to require sherpa-onnx-node',
  )
  void (async () => {
    try {
      const { child, sherpaVersion } = await spawnAsrUtility()
      // 标记行 LAZY_ASR_OK:smoke runner / 手测可 grep 确认加载链通
      logger.info(`[asr-smoke] require ok LAZY_ASR_OK sherpa=${sherpaVersion}`)
      child.kill()
    } catch (err) {
      logger.error('[asr-smoke] require FAILED LAZY_ASR_FAIL', err)
    } finally {
      app.quit()
    }
  })()
}
