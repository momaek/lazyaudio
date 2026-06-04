// T54 — 导出格式生成器单测(纯函数)。验 md/txt/srt 结构正确 = AC「打开正常」可机器断言的部分。
import { describe, it, expect } from 'vitest'
import type { RecordingMeta } from '../../../shared/recording/meta'
import type { Transcript } from '../../../shared/transcribe/transcript'
import {
  buildMarkdown,
  buildPlainText,
  buildSrt,
  renderExport,
  formatSrtTime,
  defaultExportBaseName,
  type ExportInput,
} from '../../../src/main/export/format'

const META = {
  schemaVersion: 1,
  id: 'rec_01',
  appVersion: '0.0.1',
  title: '产品周会',
  sessionType: 'meeting',
  startedAt: new Date(2026, 5, 4, 14, 30).getTime(),
  durationMs: 3_600_000, // 1h
  sources: { mic: true, system: true },
  status: 'done',
  audioFiles: {},
  transcribe: { status: 'done', engine: 'local-sense-voice' },
} as unknown as RecordingMeta

const TRANSCRIPT = {
  schemaVersion: 1,
  recordingId: 'rec_01',
  pass: 'offline',
  engine: 'local-sense-voice',
  language: 'zh',
  generatedAt: 0,
  durationMs: 3_600_000,
  segments: [
    {
      segmentId: 's0',
      start: 0,
      end: 3.2,
      text: '大家好',
      speaker: 'mixed',
      stability: 'confirmed',
    },
    {
      segmentId: 's1',
      start: 3.2,
      end: 6.0,
      text: '今天开始',
      speaker: 'mixed',
      stability: 'confirmed',
    },
  ],
} as unknown as Transcript

function input(overrides: Partial<ExportInput> = {}): ExportInput {
  return { meta: META, transcript: TRANSCRIPT, summary: '# 要点\n- 讨论了 A', ...overrides }
}

describe('formatSrtTime', () => {
  it('0 / 秒 / 时分秒毫秒', () => {
    expect(formatSrtTime(0)).toBe('00:00:00,000')
    expect(formatSrtTime(3.2)).toBe('00:00:03,200')
    expect(formatSrtTime(3661.5)).toBe('01:01:01,500')
  })
  it('毫秒四舍五入', () => {
    expect(formatSrtTime(1.2345)).toBe('00:00:01,235')
  })
})

describe('buildSrt', () => {
  it('标准 SRT 块:序号 + 时间轴 + 文本 + 空行分隔', () => {
    expect(buildSrt(input())).toBe(
      '1\n00:00:00,000 --> 00:00:03,200\n大家好\n\n2\n00:00:03,200 --> 00:00:06,000\n今天开始\n',
    )
  })
  it('无转录 → 空字符串', () => {
    expect(buildSrt(input({ transcript: null }))).toBe('')
  })
})

describe('buildMarkdown', () => {
  it('含标题 / 元信息 / 摘要 / 转录', () => {
    const md = buildMarkdown(input())
    expect(md).toContain('# 产品周会')
    expect(md).toContain('- 类型: 会议')
    expect(md).toContain('- 时长: 01:00:00')
    expect(md).toContain('- 转录引擎: local-sense-voice')
    expect(md).toContain('## 摘要')
    expect(md).toContain('讨论了 A')
    expect(md).toContain('## 转录')
    expect(md).toContain('[00:00:00] 大家好')
  })
  it('无摘要 → 占位', () => {
    expect(buildMarkdown(input({ summary: null }))).toContain('（无摘要）')
  })
  it('无转录 → 占位', () => {
    expect(buildMarkdown(input({ transcript: null }))).toContain('（无转录内容）')
  })
})

describe('buildPlainText', () => {
  it('纯文本不带行内时间戳', () => {
    const txt = buildPlainText(input())
    expect(txt).toContain('产品周会')
    expect(txt).toContain('【摘要】')
    expect(txt).toContain('【转录】')
    expect(txt).toContain('大家好')
    expect(txt).not.toContain('[00:00:00]')
  })
})

describe('renderExport', () => {
  it('按 format 分派', () => {
    expect(renderExport('md', input())).toBe(buildMarkdown(input()))
    expect(renderExport('txt', input())).toBe(buildPlainText(input()))
    expect(renderExport('srt', input())).toBe(buildSrt(input()))
  })
})

describe('defaultExportBaseName', () => {
  it('替换非法路径字符', () => {
    const meta = { ...META, title: 'a/b:c*d' } as unknown as RecordingMeta
    expect(defaultExportBaseName(meta)).toBe('a_b_c_d')
  })
})
