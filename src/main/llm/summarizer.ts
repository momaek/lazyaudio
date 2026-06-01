// T51 — 摘要编排(facade)。transcription-pipeline.md §6。
// 读 meta+transcript → pickTemplate → assemble → streamChat(SSE)→ buffer+广播 → 写 summary.md + meta.summary。
// v0.1 唯一实现 OpenAICompatible;v0.x 加本地 LLM 时换 client,本 facade 不变(§6.0)。

import fs from 'node:fs/promises'
import { readMeta, writeMeta } from '../recording/meta-store'
import { getSummaryFilePath, ensureRecordingDir } from '../recording/paths'
import { readTranscript } from '../transcribe/transcript-store'
import { readLiveTranscript } from '../transcribe/live-store'
import { getSettings, getCloudApiKey } from '../settings/settings-store'
import { getTemplate, pickTemplate, type Template } from './templates'
import { assembleUserMessage, TranscriptTooLongError } from './assemble'
import { streamChat, LlmError } from './openai-compatible-client'
import type { SummaryMeta } from '@shared/recording/meta'
import { logger } from '../logger'

export interface SummaryBroadcasters {
  onChunk: (recordingId: string, delta: string) => void
  onDone: (recordingId: string) => void
  onError: (recordingId: string, code: string, message: string) => void
}
let bc: SummaryBroadcasters = { onChunk: () => {}, onDone: () => {}, onError: () => {} }
export function setSummaryBroadcasters(b: SummaryBroadcasters): void {
  bc = b
}

const active = new Map<string, AbortController>()

export function cancelSummary(recordingId: string): boolean {
  const ac = active.get(recordingId)
  if (!ac) return false
  ac.abort()
  return true
}

async function patchSummaryMeta(recordingId: string, patch: SummaryMeta): Promise<void> {
  const meta = await readMeta(recordingId)
  if (!meta) return
  meta.summary = patch
  await writeMeta(meta)
}

async function writeSummaryFile(recordingId: string, text: string): Promise<void> {
  await ensureRecordingDir(recordingId)
  const finalPath = getSummaryFilePath(recordingId)
  const tmp = `${finalPath}.tmp`
  await fs.writeFile(tmp, text, 'utf8')
  await fs.rename(tmp, finalPath)
}

/** 是否已配置云端(baseUrl + model + key) */
export function isCloudConfigured(): boolean {
  const c = getSettings().cloud
  return !!c.baseUrl && !!c.chatModel && !!c.apiKeyCipher
}

/** 读已生成的 summary.md(无则 null) */
export async function readSummaryText(recordingId: string): Promise<string | null> {
  try {
    return await fs.readFile(getSummaryFilePath(recordingId), 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
}

/** 测试连接:用当前云端设置发一个极短请求,返回是否通 */
export async function testCloudConnection(): Promise<{ ok: boolean; error?: string }> {
  if (!isCloudConfigured()) return { ok: false, error: '未配置 baseUrl / model / key' }
  const cloud = getSettings().cloud
  try {
    await streamChat({
      baseUrl: cloud.baseUrl,
      apiKey: getCloudApiKey(),
      model: cloud.chatModel,
      systemPrompt: 'You are a connection test.',
      userMessage: 'ping',
      temperature: 0,
      maxTokens: 1,
      onChunk: () => {},
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * 生成摘要(后台跑,进度经 broadcaster 外发)。已在跑则忽略。
 * 失败只标 meta.summary failed,不影响转录。
 */
export async function summarize(
  recordingId: string,
  opts: { templateId?: string } = {},
): Promise<void> {
  if (active.has(recordingId)) {
    logger.warn('[summary] already running', { recordingId })
    return
  }
  const meta = await readMeta(recordingId)
  if (!meta) {
    bc.onError(recordingId, 'no-meta', 'recording not found')
    return
  }
  if (!isCloudConfigured()) {
    bc.onError(recordingId, 'no-config', '未配置云端 LLM(设置 → 转录引擎 → 云端)')
    return
  }

  const transcript = (await readTranscript(recordingId)) ?? (await readLiveTranscript(recordingId))
  if (!transcript || transcript.segments.length === 0) {
    bc.onError(recordingId, 'no-transcript', '没有可用的转录')
    return
  }

  const template: Template = opts.templateId
    ? (getTemplate(opts.templateId) ?? pickTemplate(meta.sessionType))
    : pickTemplate(meta.sessionType)

  const cloud = getSettings().cloud
  const apiKey = getCloudApiKey()
  // 预算:上下文窗 - 系统 prompt 估算 - 输出预留 - buffer
  const sysEst = Math.ceil(template.systemPrompt.length / 1.5)
  const maxTokens = template.output.maxTokens
  const temperature = template.output.temperature
  const budget = Math.max(1000, cloud.contextWindow - sysEst - maxTokens - 500)

  const ac = new AbortController()
  active.set(recordingId, ac)
  await patchSummaryMeta(recordingId, { status: 'running', templateId: template.id })

  try {
    const { userMessage } = assembleUserMessage(transcript, budget)
    const { text, model } = await streamChat({
      baseUrl: cloud.baseUrl,
      apiKey,
      model: cloud.chatModel,
      systemPrompt: template.systemPrompt,
      userMessage,
      temperature,
      maxTokens,
      signal: ac.signal,
      onChunk: (delta) => bc.onChunk(recordingId, delta),
    })

    await writeSummaryFile(recordingId, text)
    await patchSummaryMeta(recordingId, {
      status: 'done',
      templateId: template.id,
      model,
      generatedAt: Date.now(),
    })
    bc.onDone(recordingId)
    logger.info('[summary] done', { recordingId, templateId: template.id, chars: text.length })
  } catch (e) {
    const code =
      e instanceof TranscriptTooLongError ? 'too-long' : e instanceof LlmError ? e.code : 'unknown'
    const message = e instanceof Error ? e.message : String(e)
    logger.error('[summary] failed', { recordingId, code, message })
    await patchSummaryMeta(recordingId, { status: 'failed', templateId: template.id, error: code })
    bc.onError(recordingId, code, message)
  } finally {
    active.delete(recordingId)
  }
}
