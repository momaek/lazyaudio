// T53 — 云端转录(OpenAI 兼容 Audio API)端到端:本地 http server 当转录服务,
// 验 multipart 上传 → verbose_json 解析 → TranscribeRunResult + 错误码 + 段映射回退。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

// logger 间接 import 'electron';mock 掉避免 node 环境加载 electron
vi.mock('../../../src/main/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import {
  runCloudTranscribe,
  mapSegments,
  CloudTranscribeError,
} from '../../../src/main/transcribe/offline/openai-compatible'

let server: http.Server
let baseUrl: string
let handler: (req: http.IncomingMessage, res: http.ServerResponse) => void
let wavPath: string

beforeEach(async () => {
  server = http.createServer((req, res) => handler(req, res))
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
  wavPath = path.join(os.tmpdir(), `lazyaudio-t53-${(server.address() as AddressInfo).port}.wav`)
  await fs.writeFile(wavPath, Buffer.from('RIFF....WAVEfake-pcm-bytes'))
})
afterEach(async () => {
  await new Promise<void>((r) => server.close(() => r()))
  await fs.rm(wavPath, { force: true })
})

const base = { speaker: 'mixed', language: 'auto', apiKey: 'k', model: 'whisper-1' }

describe('runCloudTranscribe', () => {
  it('verbose_json segments → TranscribeRunResult', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          language: 'zh',
          duration: 12.5,
          text: '你好世界',
          segments: [
            { start: 0, end: 3.2, text: '你好' },
            { start: 3.2, end: 6.0, text: '世界' },
          ],
        }),
      )
    }
    const r = await runCloudTranscribe({ ...base, wavPath, baseUrl })
    expect(r.segments).toEqual([
      { start: 0, end: 3.2, text: '你好' },
      { start: 3.2, end: 6.0, text: '世界' },
    ])
    expect(r.language).toBe('zh')
    expect(r.speaker).toBe('mixed')
    expect(r.durationMs).toBe(12500)
  })

  it('无 segments 但有 text → 回退单段', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ language: 'en', duration: 4, text: 'hello there' }))
    }
    const r = await runCloudTranscribe({ ...base, wavPath, baseUrl })
    expect(r.segments).toEqual([{ start: 0, end: 4, text: 'hello there' }])
  })

  it('401 → CloudTranscribeError auth', async () => {
    handler = (_req, res) => {
      res.writeHead(401)
      res.end('unauthorized')
    }
    await expect(runCloudTranscribe({ ...base, wavPath, baseUrl })).rejects.toMatchObject({
      name: 'CloudTranscribeError',
      code: 'auth',
    })
  })

  it('发了正确的 endpoint + Bearer + multipart(含 model / response_format)', async () => {
    let seen: { url?: string; auth?: string; ctype?: string; body?: string } = {}
    handler = (req, res) => {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        seen = {
          url: req.url,
          auth: req.headers.authorization,
          ctype: req.headers['content-type'],
          body,
        }
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ duration: 1, segments: [{ start: 0, end: 1, text: 'x' }] }))
      })
    }
    await runCloudTranscribe({ ...base, wavPath, baseUrl, apiKey: 'sk-xyz', model: 'my-asr' })
    expect(seen.url).toBe('/v1/audio/transcriptions')
    expect(seen.auth).toBe('Bearer sk-xyz')
    expect(seen.ctype).toMatch(/^multipart\/form-data/)
    expect(seen.body).toContain('my-asr')
    expect(seen.body).toContain('verbose_json')
  })

  it('CloudTranscribeError 是 Error 子类', () => {
    expect(new CloudTranscribeError('auth', 'x')).toBeInstanceOf(Error)
  })
})

describe('mapSegments', () => {
  it('过滤空 text 段', () => {
    expect(
      mapSegments({
        segments: [
          { start: 0, end: 1, text: ' hi ' },
          { start: 1, end: 2, text: '   ' },
        ],
      }),
    ).toEqual([{ start: 0, end: 1, text: 'hi' }])
  })

  it('全空 → 空数组', () => {
    expect(mapSegments({ segments: [], text: '' })).toEqual([])
  })
})
