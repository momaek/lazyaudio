// T17 — decideCloseAction 单测(AC「录音中按 ⌘W 不停」的判定核心)。
// 纯函数,无 electron 依赖。
import { describe, it, expect } from 'vitest'
import { decideCloseAction } from '../../../src/main/lifecycle/close-action'

describe('decideCloseAction', () => {
  it('录音中:即使设置是 quit 也强制最小化(不退出 → 不停录)', () => {
    expect(decideCloseAction('recording', 'quit')).toBe('minimize')
    expect(decideCloseAction('recording', 'minimize')).toBe('minimize')
  })

  it('stopping 中同样强制最小化', () => {
    expect(decideCloseAction('stopping', 'quit')).toBe('minimize')
  })

  it('非录音:按设置走', () => {
    expect(decideCloseAction('idle', 'quit')).toBe('quit')
    expect(decideCloseAction('idle', 'minimize')).toBe('minimize')
    expect(decideCloseAction('preparing', 'quit')).toBe('quit')
  })
})
