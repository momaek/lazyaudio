// T31 — mirror.ts 单测:orderSources(纯函数,按 locale 排序)。
// probeFastest 走网络,不在单测覆盖(端到端 AC 验);这里只验默认顺序。
import { describe, it, expect } from 'vitest'
import { orderSources } from '../../../../src/main/transcribe/model/mirror'

const SOURCES = [
  'https://hf-mirror.com/repo/resolve/main/{file}',
  'https://huggingface.co/repo/resolve/main/{file}',
]

describe('orderSources', () => {
  it('zh locale:保持 registry 原序(hf-mirror 先)', () => {
    expect(orderSources(SOURCES, 'zh-CN')).toEqual(SOURCES)
  })

  it('非 zh locale:把 hf-mirror 排到最后', () => {
    expect(orderSources(SOURCES, 'en-US')).toEqual([
      'https://huggingface.co/repo/resolve/main/{file}',
      'https://hf-mirror.com/repo/resolve/main/{file}',
    ])
  })

  it('不改原数组(返回新数组)', () => {
    const copy = [...SOURCES]
    orderSources(SOURCES, 'en')
    expect(SOURCES).toEqual(copy)
  })
})
