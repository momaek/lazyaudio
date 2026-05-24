// before-quit hook 集合
//
// T10 阶段只搭骨架,真正的"录音中拦截退出"逻辑在 T17 状态保护 实现。
// 现在这里只挂一个空 hook + log,让后续 T17 / T19 接入时知道在哪里加。

import { app } from 'electron'
import { logger } from '../logger'

type BeforeQuitHook = (event: Electron.Event) => void | Promise<void>

const hooks: BeforeQuitHook[] = []

/**
 * 注册一个 before-quit hook。多个 hook 按注册顺序串行执行,任一 hook 调用
 * `event.preventDefault()` 都会阻止退出(由 hook 自己 dialog 询问用户再决定)。
 *
 * T10 阶段 hooks 数组始终为空。T17 会注册"录音中阻断退出"hook,
 * T19 macOS smoke 验证时若发现 utility 还没关也会注册等待 hook。
 */
export function registerBeforeQuitHook(hook: BeforeQuitHook): void {
  hooks.push(hook)
}

export function installBeforeQuitHandler(): void {
  app.on('before-quit', async (event) => {
    logger.info('before-quit', { hookCount: hooks.length })
    for (const hook of hooks) {
      try {
        await hook(event)
        if (event.defaultPrevented) {
          logger.info('before-quit prevented by hook')
          return
        }
      } catch (err) {
        logger.error('before-quit hook failed', { err: String(err) })
      }
    }
  })
}
