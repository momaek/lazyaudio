// T04 — system:ping 端到端 IPC 单元测试。
// 不起 Electron;mock ipcMain.handle 捕获 handler,直接 invoke 验 schema + 字段。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CHANNEL, PingResult, PingArgs } from '@shared/ipc/system'

type Handler = (event: unknown, args: unknown) => unknown

describe('IPC system.ping', () => {
  const handlers = new Map<string, Handler>()

  beforeEach(() => {
    handlers.clear()
    vi.resetModules()
    // Mock electron 模块,让 main 侧 register() 把 handler 挂进我们捕获的 map
    vi.doMock('electron', () => ({
      ipcMain: {
        handle: (channel: string, h: Handler): void => {
          handlers.set(channel, h)
        },
      },
    }))
  })

  afterEach(() => {
    vi.doUnmock('electron')
  })

  it('注册 system:ping 通道,返回 schema 合法的 PingResult', async () => {
    const { register } = await import('../../../src/main/ipc/system')
    register()

    const handler = handlers.get(CHANNEL.ping)
    expect(handler, 'system:ping handler 应该被注册').toBeDefined()

    const before = Date.now()
    const result = await handler!({}, {})
    const after = Date.now()

    // schema 合法
    const parsed = PingResult.parse(result)

    expect(parsed.tsMs).toBeGreaterThanOrEqual(before)
    expect(parsed.tsMs).toBeLessThanOrEqual(after)
    expect(parsed.nodeVersion).toBe(process.versions.node)
    expect(typeof parsed.electronVersion).toBe('string')
  })

  it('PingArgs 接受空 object 也接受 undefined', () => {
    // PingArgs 是 z.object({}).optional() —— renderer 调用时可不传参
    expect(() => PingArgs.parse({})).not.toThrow()
    expect(() => PingArgs.parse(undefined)).not.toThrow()
  })
})
