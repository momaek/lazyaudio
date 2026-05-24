// 单实例锁:第二个进程启动直接退,第一个进程接到 'second-instance' 事件可把已有主窗口前置
// (T10 阶段只做基本锁;前置主窗口的逻辑在 T15 加列表 / T17 状态保护时一并完善)

import { app } from 'electron'
import { logger } from '../logger'

/**
 * 申请单实例锁。返回 true 表示当前进程是首启;false 表示已有进程在跑,调用方应 app.quit()。
 */
export function acquireSingleInstanceLock(): boolean {
  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    logger.warn('another instance is running, quitting')
    return false
  }

  app.on('second-instance', (_event, argv) => {
    // 第二个进程被拒后,Electron 把它的 argv 转发过来。T10 阶段仅记日志,
    // 显式聚焦主窗口的逻辑留给 T15(主窗口列表项点击)和 T17(状态保护)统一处理。
    logger.info('second-instance signal received', { argv })
  })

  return true
}
