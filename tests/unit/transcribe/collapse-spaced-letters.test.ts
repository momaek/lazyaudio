// T61 — collapseSpacedLetters:SenseVoice 把英文缩写输出成「c p o」,合并成「CPO」。
import { describe, it, expect } from 'vitest'
import { collapseSpacedLetters } from '../../../src/main/workers/asr/recognize'

describe('collapseSpacedLetters', () => {
  it('合并 ≥2 个连续单字母为大写缩写(缩写两侧空格保留,可读且 CER 已去空格)', () => {
    expect(collapseSpacedLetters('用 c p o 重塑行业')).toBe('用 CPO 重塑行业')
    expect(collapseSpacedLetters('去年 g d p 增速')).toBe('去年 GDP 增速')
    expect(collapseSpacedLetters('a i 算力')).toBe('AI 算力')
  })

  it('不动单个字母(避免误伤 B 站这类)', () => {
    expect(collapseSpacedLetters('上 b 站看')).toBe('上 b 站看')
    expect(collapseSpacedLetters('Q 25 财报')).toBe('Q 25 财报') // 数字不参与
  })

  it('不动已成词的英文', () => {
    expect(collapseSpacedLetters('DeepSeek 很强')).toBe('DeepSeek 很强')
    expect(collapseSpacedLetters('plan b 方案')).toBe('plan b 方案') // plan 是多字母,b 单独不合并
  })

  it('纯中文 / 空串不受影响', () => {
    expect(collapseSpacedLetters('这是一段中文')).toBe('这是一段中文')
    expect(collapseSpacedLetters('')).toBe('')
  })
})
