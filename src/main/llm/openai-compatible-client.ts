// T51 — OpenAI 兼容 chat API 客户端(SSE 流式)。transcription-pipeline.md §6.5/§6.6。
// POST {baseUrl}/chat/completions, Bearer, stream:true, messages[system,user]。
// 错误:401/403→auth;429→退避重试 1 次;5xx→重试 2 次指数退避;不支持 stream→非流式 fallback。

import { Readable } from 'node:stream'

export type LlmErrorCode = 'auth' | 'rate-limit' | 'server' | 'network' | 'unknown'

export class LlmError extends Error {
  constructor(
    public readonly code: LlmErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'LlmError'
  }
}

export interface ChatParams {
  baseUrl: string
  apiKey: string
  model: string
  systemPrompt: string
  userMessage: string
  temperature: number
  maxTokens: number
  signal?: AbortSignal
  onChunk: (delta: string) => void
}

export interface ChatResult {
  text: string
  model: string
}

function endpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new LlmError('network', 'aborted'))
    })
  })
}

async function doRequest(p: ChatParams): Promise<Response> {
  const body = {
    model: p.model,
    messages: [
      { role: 'system', content: p.systemPrompt },
      { role: 'user', content: p.userMessage },
    ],
    stream: true,
    temperature: p.temperature,
    max_tokens: p.maxTokens,
  }
  try {
    return await fetch(endpoint(p.baseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${p.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: p.signal ?? null,
    })
  } catch (e) {
    throw new LlmError('network', `request failed: ${String(e)}`)
  }
}

/** 解析一行 SSE `data: {...}`,抽 delta.content;返回 null 表示该行无内容 / [DONE] */
export function parseDelta(line: string): string | null {
  if (!line.startsWith('data:')) return null
  const payload = line.slice(5).trim()
  if (payload === '' || payload === '[DONE]') return null
  try {
    const json = JSON.parse(payload) as {
      choices?: { delta?: { content?: string }; message?: { content?: string } }[]
    }
    const choice = json.choices?.[0]
    return choice?.delta?.content ?? choice?.message?.content ?? null
  } catch {
    return null
  }
}

async function consumeStream(res: Response, onChunk: (d: string) => void): Promise<string> {
  if (!res.body) throw new LlmError('server', 'empty response body')
  const contentType = res.headers.get('content-type') ?? ''

  // fallback:服务端忽略 stream,直接返回整段 JSON
  if (contentType.includes('application/json')) {
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const text = json.choices?.[0]?.message?.content ?? ''
    if (text) onChunk(text)
    return text
  }

  const nodeStream = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0])
  let buffer = ''
  let text = ''
  for await (const chunk of nodeStream) {
    buffer += (chunk as Buffer).toString('utf8')
    let nl: number
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      const delta = parseDelta(line)
      if (delta) {
        text += delta
        onChunk(delta)
      }
    }
  }
  const tail = parseDelta(buffer.trim())
  if (tail) {
    text += tail
    onChunk(tail)
  }
  return text
}

/** 调一次(含按状态码的重试)。返回完整文本 + 实际 model。 */
export async function streamChat(p: ChatParams): Promise<ChatResult> {
  const maxAttempts = 3
  let lastErr: LlmError | null = null
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await doRequest(p)

    if (res.status === 401 || res.status === 403) {
      throw new LlmError('auth', `HTTP ${res.status}: 认证失败,请检查 API key`)
    }
    if (res.status === 429) {
      lastErr = new LlmError('rate-limit', 'HTTP 429: 限流')
      if (attempt < maxAttempts - 1) {
        await sleep(1000 * (attempt + 1), p.signal)
        continue
      }
      throw lastErr
    }
    if (res.status >= 500) {
      lastErr = new LlmError('server', `HTTP ${res.status}: 服务端错误`)
      if (attempt < maxAttempts - 1) {
        await sleep(800 * 2 ** attempt, p.signal)
        continue
      }
      throw lastErr
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new LlmError('unknown', `HTTP ${res.status}: ${detail.slice(0, 200)}`)
    }

    const text = await consumeStream(res, p.onChunk)
    return { text, model: p.model }
  }
  throw lastErr ?? new LlmError('unknown', 'unreachable')
}
