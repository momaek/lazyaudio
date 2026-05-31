// T51 — 内置摘要模板类型。prompt 全文常量(llm-templates.md §2/§3 + T51 新写 3 个)。

import type { SessionType } from '@shared/ipc/record'
import type { TemplateId } from '@shared/llm/templates'

export interface Template {
  id: TemplateId
  name: string
  icon: string
  /** 该模板默认服务的会话类型(pickTemplate 反查) */
  sessionTypes: SessionType[]
  output: { maxTokens: number; temperature: number }
  /** system prompt 全文(user message = 组装后的转录文本) */
  systemPrompt: string
}
