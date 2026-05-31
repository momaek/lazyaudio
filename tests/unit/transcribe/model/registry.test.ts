// T31 — registry.ts 单测:内置 MODELS 形状 + resolveSourceUrl。
// loader.test.ts 同套路 mock electron(registry 顶层不碰 app,但保险)。
import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({ app: {} }))

import {
  MODELS,
  listModelEntries,
  getModelEntry,
  resolveSourceUrl,
} from '../../../../src/main/transcribe/model/registry'

describe('model registry', () => {
  it('恰好一个默认 ASR 模型(SenseVoice int8)', () => {
    const def = listModelEntries().filter((e) => e.kind === 'asr' && e.isDefault)
    expect(def.length).toBe(1)
    expect(def[0]?.key).toContain('sense-voice')
  })

  it('恰好一个默认 VAD 模型(Silero,Pass A 实时分段依赖)', () => {
    const def = listModelEntries().filter((e) => e.kind === 'vad' && e.isDefault)
    expect(def.length).toBe(1)
    expect(def[0]?.key).toContain('silero')
  })

  it('每个 entry:files 非空、sha256 是 64 位 hex、bytes>0、sizeBytes==文件字节和', () => {
    for (const entry of listModelEntries()) {
      expect(entry.files.length).toBeGreaterThan(0)
      let sum = 0
      for (const f of entry.files) {
        expect(f.sha256).toMatch(/^[0-9a-f]{64}$/)
        expect(f.bytes).toBeGreaterThan(0)
        sum += f.bytes
      }
      expect(entry.sizeBytes).toBe(sum)
    }
  })

  it('每个 entry:sources 非空且含 {file} 占位符', () => {
    for (const entry of listModelEntries()) {
      expect(entry.sources.length).toBeGreaterThan(0)
      for (const s of entry.sources) expect(s).toContain('{file}')
    }
  })

  it('getModelEntry 命中 / 未命中', () => {
    const key = Object.keys(MODELS)[0]!
    expect(getModelEntry(key)?.key).toBe(key)
    expect(getModelEntry('nope')).toBeUndefined()
  })

  it('resolveSourceUrl 替换 {file}', () => {
    expect(resolveSourceUrl('https://x/{file}', 'model.int8.onnx')).toBe(
      'https://x/model.int8.onnx',
    )
  })
})
