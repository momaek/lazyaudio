// T51 — LLM 摘要 IPC schema。

import { z } from 'zod'
import { SUMMARY as CHANNEL } from './channels'
import { SummaryStatus } from '../recording/meta'
import { TEMPLATE_IDS } from '../llm/templates'
import { SessionType } from './record'

export { CHANNEL, SummaryStatus }

export const GenerateArgs = z.object({
  recordingId: z.string(),
  /** 不传 = 按 sessionType 自动选模板 */
  templateId: z.string().optional(),
})
export type GenerateArgs = z.infer<typeof GenerateArgs>
export const GenerateResult = z.object({ ok: z.boolean() })
export type GenerateResult = z.infer<typeof GenerateResult>

export const CancelArgs = z.object({ recordingId: z.string() })
export type CancelArgs = z.infer<typeof CancelArgs>
export const CancelResult = z.object({ ok: z.boolean() })
export type CancelResult = z.infer<typeof CancelResult>

export const GetArgs = z.object({ recordingId: z.string() })
export type GetArgs = z.infer<typeof GetArgs>
export const GetResult = z.object({
  status: SummaryStatus,
  text: z.string().nullable(),
  templateId: z.string().optional(),
  model: z.string().optional(),
  error: z.string().optional(),
})
export type GetResult = z.infer<typeof GetResult>

export const TestArgs = z.object({}).optional()
export type TestArgs = z.infer<typeof TestArgs>
export const TestResult = z.object({ ok: z.boolean(), error: z.string().optional() })
export type TestResult = z.infer<typeof TestResult>

export const TemplateId = z.enum(TEMPLATE_IDS)
export type TemplateId = z.infer<typeof TemplateId>

export const SummaryTemplate = z.object({
  id: TemplateId,
  name: z.string(),
  icon: z.string(),
  sessionTypes: z.array(SessionType),
  systemPrompt: z.string(),
  defaultSystemPrompt: z.string(),
  output: z.object({
    maxTokens: z.number().int().positive(),
    temperature: z.number().nonnegative(),
  }),
  isCustomized: z.boolean(),
})
export type SummaryTemplate = z.infer<typeof SummaryTemplate>

export const ListTemplatesArgs = z.object({}).optional()
export type ListTemplatesArgs = z.infer<typeof ListTemplatesArgs>
export const ListTemplatesResult = z.object({
  templates: z.array(SummaryTemplate),
  templatePerSessionType: z.partialRecord(SessionType, TemplateId),
})
export type ListTemplatesResult = z.infer<typeof ListTemplatesResult>

export const SetTemplateArgs = z.object({
  id: TemplateId,
  systemPrompt: z.string().min(1),
  sessionTypes: z.array(SessionType).min(1),
})
export type SetTemplateArgs = z.infer<typeof SetTemplateArgs>
export const SetTemplateResult = z.object({ ok: z.boolean(), template: SummaryTemplate })
export type SetTemplateResult = z.infer<typeof SetTemplateResult>

export const ResetTemplateArgs = z.object({ id: TemplateId })
export type ResetTemplateArgs = z.infer<typeof ResetTemplateArgs>
export const ResetTemplateResult = z.object({ ok: z.boolean(), template: SummaryTemplate })
export type ResetTemplateResult = z.infer<typeof ResetTemplateResult>

// ---- 流式事件 ----
export const ChunkEvent = z.object({ recordingId: z.string(), delta: z.string() })
export type ChunkEvent = z.infer<typeof ChunkEvent>
export const DoneEvent = z.object({ recordingId: z.string() })
export type DoneEvent = z.infer<typeof DoneEvent>
export const ErrorEvent = z.object({
  recordingId: z.string(),
  code: z.string(),
  message: z.string(),
})
export type ErrorEvent = z.infer<typeof ErrorEvent>
