// T51 — pickTemplate / getTemplate + SSE parseDelta 单测。
import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({ app: {} }))

import { pickTemplate, getTemplate, BUILTIN_TEMPLATES } from '../../../src/main/llm/templates'
import { parseDelta } from '../../../src/main/llm/openai-compatible-client'

describe('pickTemplate', () => {
  it('各 sessionType 选对模板;podcast/general → note', () => {
    expect(pickTemplate('meeting').id).toBe('meeting')
    expect(pickTemplate('note').id).toBe('note')
    expect(pickTemplate('interview-as-interviewer').id).toBe('interview-as-interviewer')
    expect(pickTemplate('interview-as-candidate').id).toBe('interview-as-candidate')
    expect(pickTemplate('lecture').id).toBe('lecture')
    expect(pickTemplate('podcast').id).toBe('note')
    expect(pickTemplate('general').id).toBe('note')
  })

  it('5 个模板都有非空 systemPrompt + 合理 output', () => {
    for (const t of Object.values(BUILTIN_TEMPLATES)) {
      expect(t.systemPrompt.length).toBeGreaterThan(50)
      expect(t.output.maxTokens).toBeGreaterThan(0)
      expect(t.output.temperature).toBeGreaterThanOrEqual(0)
    }
  })

  it('getTemplate 命中 / 未命中', () => {
    expect(getTemplate('meeting')?.id).toBe('meeting')
    expect(getTemplate('nope')).toBeUndefined()
  })
})

describe('parseDelta (SSE)', () => {
  it('抽 choices[0].delta.content', () => {
    expect(parseDelta('data: {"choices":[{"delta":{"content":"你好"}}]}')).toBe('你好')
  })
  it('[DONE] / 空行 → null', () => {
    expect(parseDelta('data: [DONE]')).toBeNull()
    expect(parseDelta('')).toBeNull()
    expect(parseDelta(': keep-alive')).toBeNull()
  })
  it('非流式 message.content fallback', () => {
    expect(parseDelta('data: {"choices":[{"message":{"content":"整段"}}]}')).toBe('整段')
  })
  it('坏 JSON → null(不抛)', () => {
    expect(parseDelta('data: {bad json')).toBeNull()
  })
})
