// T51 — assemble 单测:段格式 / sysmeta / 截断。
import { describe, it, expect } from 'vitest'
import { assembleUserMessage, TranscriptTooLongError } from '../../../src/main/llm/assemble'
import type { Transcript } from '@shared/transcribe/transcript'

function mk(segments: { start: number; speaker: string; text: string }[]): Transcript {
  return {
    schemaVersion: 1,
    recordingId: 'r1',
    pass: 'offline',
    engine: 'local-sense-voice',
    language: 'auto',
    generatedAt: 0,
    durationMs: 0,
    segments: segments.map((s, i) => ({
      segmentId: `s${i}`,
      start: s.start,
      end: s.start + 1,
      text: s.text,
      speaker: s.speaker,
      stability: 'confirmed' as const,
    })),
  }
}

describe('assembleUserMessage', () => {
  it('段格式 [speaker HH:MM:SS] text,按 start 排序', () => {
    const t = mk([
      { start: 65, speaker: 'system', text: '好的' },
      { start: 12, speaker: 'mic', text: '你好' },
    ])
    const { userMessage } = assembleUserMessage(t, 100000)
    const lines = userMessage.split('\n')
    expect(lines[0]).toBe('[mic 00:00:12] 你好')
    expect(lines[1]).toBe('[system 00:01:05] 好的')
  })

  it('仅 mic 路 → 顶部插 sysmeta', () => {
    const t = mk([{ start: 0, speaker: 'mic', text: '自言自语' }])
    const { userMessage } = assembleUserMessage(t, 100000)
    expect(userMessage.startsWith('[sysmeta]')).toBe(true)
    expect(userMessage).toContain('仅 mic 路')
  })

  it('mixed 轨 → mixed sysmeta', () => {
    const t = mk([{ start: 0, speaker: 'mixed', text: 'x' }])
    const { userMessage } = assembleUserMessage(t, 100000)
    expect(userMessage).toContain('混合轨')
  })

  it('超预算 → 抛 TranscriptTooLongError', () => {
    const big = Array.from({ length: 500 }, (_, i) => ({
      start: i,
      speaker: 'mic',
      text: '这是一段很长的内容用来撑爆 token 预算'.repeat(5),
    }))
    expect(() => assembleUserMessage(mk(big), 100)).toThrow(TranscriptTooLongError)
  })

  it('80-100% 预算 → 截断中间 + 占位', () => {
    // 构造刚好落在 80-100% 区间:预算调到接近文本估算
    const segs = Array.from({ length: 30 }, (_, i) => ({
      start: i * 10,
      speaker: 'mic',
      text: '一段十来个字的内容做测试用',
    }))
    const t = mk(segs)
    const full = assembleUserMessage(t, 1e9).userMessage
    const budget = Math.ceil(full.length / 1.5 / 0.9) // 落在 80-100%
    const { userMessage, truncated } = assembleUserMessage(t, budget)
    expect(truncated).toBe(true)
    expect(userMessage).toContain('截断')
  })
})
