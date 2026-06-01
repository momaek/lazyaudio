// T50 — onboarding 屏 0 系统版本 gate 单测。
import { describe, it, expect } from 'vitest'
import { evaluatePlatformSupport, systemUpdateUrl } from '../../../src/main/onboarding/platform'

describe('onboarding platform gate', () => {
  it('macOS 14.2+ 通过,14.1 阻断', () => {
    expect(evaluatePlatformSupport({ platform: 'darwin', release: '23.2.0' }).ok).toBe(true)
    const blocked = evaluatePlatformSupport({ platform: 'darwin', release: '23.1.0' })
    expect(blocked.ok).toBe(false)
    expect(blocked.title).toContain('macOS 14.2')
  })

  it('Windows build 19041+ 通过,旧 build 阻断', () => {
    expect(evaluatePlatformSupport({ platform: 'win32', release: '10.0.19041' }).ok).toBe(true)
    const blocked = evaluatePlatformSupport({ platform: 'win32', release: '10.0.18362' })
    expect(blocked.ok).toBe(false)
    expect(blocked.title).toContain('Windows 10 2004')
  })

  it('不支持的平台进入 dead-end', () => {
    const linux = evaluatePlatformSupport({ platform: 'linux', release: '6.0.0' })
    expect(linux.ok).toBe(false)
    expect(linux.platform).toBe('unsupported')
  })

  it('系统更新 deep link 按平台返回', () => {
    expect(systemUpdateUrl('darwin')).toContain('softwareupdate')
    expect(systemUpdateUrl('win32')).toBe('ms-settings:windowsupdate')
    expect(systemUpdateUrl('unsupported')).toBeNull()
  })
})
