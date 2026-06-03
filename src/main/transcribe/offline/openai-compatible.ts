// T53 — 云端转录(OpenAI 兼容 Audio Transcription API)。transcription-pipeline.md §4。
//
// POST {baseUrl}/audio/transcriptions, Bearer, multipart/form-data,
//   file=<wav> / model / language / response_format=verbose_json / timestamp_granularities[]=segment。
// 一次性拿 verbose_json(v0.1 不走 streaming,§4.4)。
// 文件大小:按「远端能处理任意大小」直传 WAV,不转码 / 不切片(§4.2 的 ffmpeg 路径留后续)。
// 错误:401/403→auth(不重试);429/5xx→指数退避(1s/5s/15s)重试 3 次;其余 4xx 不重试。
// 隐私(§4.5):日志不记请求 body(含音频)/ 响应原文,只记 host + 状态。

import fs from 'node:fs/promises'
import path from 'node:path'
import type { AsrSegment } from '@shared/transcribe/asr-protocol'
import type { TranscribeRunResult } from './spawn'
import { logger } from '../../logger'

export type CloudTranscribeErrorCode = 'auth' | 'rate-limit' | 'server' | 'network' | 'unknown'

export class CloudTranscribeError extends Error {
  constructor(
    public readonly code: CloudTranscribeErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'CloudTranscribeError'
  }
}

export interface CloudTranscribeParams {
  wavPath: string
  /** segment 上的 speaker 标记(mixed / mic / system) */
  speaker: string
  /** zh | en | auto */
  language: string
  baseUrl: string
  apiKey: string
  /** 用户配置的转录模型名(如 whisper-1) */
  model: string
  signal?: AbortSignal
}

function endpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/audio/transcriptions`
}

/** 脱敏:日志只保留 host,不暴露完整 URL / path */
function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return '<invalid-url>'
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new CloudTranscribeError('network', 'aborted'))
    })
  })
}

interface VerboseJson {
  language?: string
  duration?: number
  text?: string
  segments?: { start?: number; end?: number; text?: string }[]
}

/** verbose_json → AsrSegment[]。无 segments 时回退成单段(用整段 text)。 */
export function mapSegments(data: VerboseJson): AsrSegment[] {
  if (Array.isArray(data.segments) && data.segments.length > 0) {
    return data.segments
      .map((s) => ({
        start: Number(s.start) || 0,
        end: Number(s.end) || 0,
        text: String(s.text ?? '').trim(),
      }))
      .filter((s) => s.text.length > 0)
  }
  const text = String(data.text ?? '').trim()
  if (text) return [{ start: 0, end: Number(data.duration) || 0, text }]
  return []
}

async function buildForm(p: CloudTranscribeParams): Promise<FormData> {
  const buf = await fs.readFile(p.wavPath)
  const form = new FormData()
  // Blob 拷贝一份 buffer(Uint8Array),避免 external buffer 限制
  form.append(
    'file',
    new Blob([new Uint8Array(buf)], { type: 'audio/wav' }),
    path.basename(p.wavPath),
  )
  form.append('model', p.model)
  form.append('language', p.language)
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'segment')
  return form
}

async function doRequest(p: CloudTranscribeParams, form: FormData): Promise<Response> {
  try {
    return await fetch(endpoint(p.baseUrl), {
      method: 'POST',
      headers: { Authorization: `Bearer ${p.apiKey}` },
      body: form,
      signal: p.signal ?? null,
    })
  } catch (e) {
    throw new CloudTranscribeError('network', `request failed: ${String(e)}`)
  }
}

/** 调一次云端转录(含按状态码的重试)。返回 TranscribeRunResult(与本地引擎同形)。 */
export async function runCloudTranscribe(p: CloudTranscribeParams): Promise<TranscribeRunResult> {
  const backoff = [1000, 5000, 15000] // §4.3:429/5xx 指数退避 3 次
  const maxAttempts = backoff.length
  let lastErr: CloudTranscribeError | null = null

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const form = await buildForm(p) // FormData 单次性,重试需重建
    const res = await doRequest(p, form)

    if (res.status === 401 || res.status === 403) {
      throw new CloudTranscribeError('auth', `HTTP ${res.status}: 认证失败,请检查 API key`)
    }
    if (res.status === 429 || res.status >= 500) {
      lastErr = new CloudTranscribeError(
        res.status === 429 ? 'rate-limit' : 'server',
        `HTTP ${res.status}: ${res.status === 429 ? '限流' : '服务端错误'}`,
      )
      if (attempt < maxAttempts - 1) {
        logger.warn('[cloud-transcribe] retrying', {
          host: hostOf(p.baseUrl),
          status: res.status,
          attempt,
        })
        await sleep(backoff[attempt]!, p.signal)
        continue
      }
      throw lastErr
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new CloudTranscribeError('unknown', `HTTP ${res.status}: ${detail.slice(0, 200)}`)
    }

    let data: VerboseJson
    try {
      data = (await res.json()) as VerboseJson
    } catch (e) {
      throw new CloudTranscribeError('server', `响应解析失败: ${String(e)}`)
    }
    const segments = mapSegments(data)
    const durationMs = Math.round((Number(data.duration) || 0) * 1000)
    logger.info('[cloud-transcribe] done', {
      host: hostOf(p.baseUrl),
      segments: segments.length,
      durationMs,
    })
    return {
      segments,
      language: data.language || p.language,
      speaker: p.speaker,
      durationMs,
    }
  }
  throw lastErr ?? new CloudTranscribeError('unknown', 'unreachable')
}
