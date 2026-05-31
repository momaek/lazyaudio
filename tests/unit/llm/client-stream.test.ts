// T51 — streamChat 端到端(本地 SSE server,无需真 LLM):验 fetch → SSE 解析 → onChunk 拼接 + 错误码。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { streamChat, LlmError } from '../../../src/main/llm/openai-compatible-client'

let server: http.Server
let baseUrl: string
let handler: (req: http.IncomingMessage, res: http.ServerResponse) => void

beforeEach(async () => {
  server = http.createServer((req, res) => handler(req, res))
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
})
afterEach(async () => {
  await new Promise<void>((r) => server.close(() => r()))
})

const base = {
  apiKey: 'k',
  model: 'm',
  systemPrompt: 's',
  userMessage: 'u',
  temperature: 0.3,
  maxTokens: 100,
}

describe('streamChat', () => {
  it('SSE 流 → onChunk 逐段 + 返回完整文本', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write('data: {"choices":[{"delta":{"content":"你好"}}]}\n\n')
      res.write('data: {"choices":[{"delta":{"content":"世界"}}]}\n\n')
      res.write('data: [DONE]\n\n')
      res.end()
    }
    const chunks: string[] = []
    const r = await streamChat({ ...base, baseUrl, onChunk: (d) => chunks.push(d) })
    expect(chunks).toEqual(['你好', '世界'])
    expect(r.text).toBe('你好世界')
  })

  it('非流式 JSON → fallback 解析', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ choices: [{ message: { content: '整段摘要' } }] }))
    }
    const r = await streamChat({ ...base, baseUrl, onChunk: () => {} })
    expect(r.text).toBe('整段摘要')
  })

  it('401 → LlmError auth', async () => {
    handler = (_req, res) => {
      res.writeHead(401)
      res.end('unauthorized')
    }
    await expect(streamChat({ ...base, baseUrl, onChunk: () => {} })).rejects.toMatchObject({
      name: 'LlmError',
      code: 'auth',
    })
  })

  it('发了正确的 endpoint + Bearer + body', async () => {
    let seen: { url?: string; auth?: string; body?: string } = {}
    handler = (req, res) => {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        seen = { url: req.url, auth: req.headers.authorization, body }
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        res.write('data: [DONE]\n\n')
        res.end()
      })
    }
    await streamChat({ ...base, baseUrl, apiKey: 'sk-xyz', onChunk: () => {} })
    expect(seen.url).toBe('/v1/chat/completions')
    expect(seen.auth).toBe('Bearer sk-xyz')
    expect(JSON.parse(seen.body!).stream).toBe(true)
  })

  it('LlmError 是 Error 子类', () => {
    expect(new LlmError('auth', 'x')).toBeInstanceOf(Error)
  })
})
