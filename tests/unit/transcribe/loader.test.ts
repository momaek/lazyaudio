// T30 — sherpaPlatformDir 路径拼接单测(dev vs packaged + 平台子包名)。
import { describe, it, expect, vi } from 'vitest'

// loader.ts 顶层 import { app } from 'electron';被测的 sherpaPlatformDir 是纯函数不碰 app,
// mock 掉 electron 避免在 node 测试环境解析真实 electron 二进制。
vi.mock('electron', () => ({ app: {} }))

import { sherpaPlatformDir } from '../../../src/main/transcribe/offline/loader'

describe('sherpaPlatformDir', () => {
  it('dev(未打包):node_modules 在 appPath 下', () => {
    expect(
      sherpaPlatformDir({
        isPackaged: false,
        appPath: '/repo',
        resourcesPath: '/ignored',
        platform: 'darwin',
        arch: 'arm64',
      }),
    ).toBe('/repo/node_modules/sherpa-onnx-darwin-arm64')
  })

  it('packaged:node_modules 在 resourcesPath/app.asar.unpacked 下', () => {
    expect(
      sherpaPlatformDir({
        isPackaged: true,
        appPath: '/ignored',
        resourcesPath: '/App.app/Contents/Resources',
        platform: 'darwin',
        arch: 'arm64',
      }),
    ).toBe('/App.app/Contents/Resources/app.asar.unpacked/node_modules/sherpa-onnx-darwin-arm64')
  })

  it('win32 子包名重命名为 win(对齐 sherpa-onnx-win-x64 实际包名)', () => {
    expect(
      sherpaPlatformDir({
        isPackaged: false,
        appPath: '/repo',
        resourcesPath: '/x',
        platform: 'win32',
        arch: 'x64',
      }),
    ).toBe('/repo/node_modules/sherpa-onnx-win-x64')
  })
})
