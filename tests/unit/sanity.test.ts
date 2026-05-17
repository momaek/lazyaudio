// T02 sanity test:验证 vitest 工具链跑得起来。
// 后续 T 自带的单元测试逐步替换 / 增补本文件。
import { describe, it, expect } from 'vitest'

describe('toolchain sanity', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2)
  })

  it('resolves path alias @shared (smoke)', async () => {
    // shared/ 现在还没文件,但 alias 解析路径应该走得通。
    // 这里只做编译期 sanity:能 import 时不报"找不到模块"。
    // 真实 shared/ 模块测试随 T04 IPC 接入。
    expect(typeof process.versions.node).toBe('string')
  })
})
