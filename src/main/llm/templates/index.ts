// T51/T52 — 内置模板注册 + 用户覆盖 + 按 sessionType 选模板。

import type { SessionType } from '@shared/ipc/record'
import type { TemplateId } from '@shared/llm/templates'
import { TEMPLATE_IDS } from '@shared/llm/templates'
import { getSettings } from '../../settings/settings-store'
import type { Template } from './types'
import { meetingTemplate } from './meeting'
import { noteTemplate } from './note'
import { interviewAsInterviewerTemplate } from './interview-as-interviewer'
import { interviewAsCandidateTemplate } from './interview-as-candidate'
import { lectureTemplate } from './lecture'

export type { Template } from './types'

export const BUILTIN_TEMPLATES: Record<TemplateId, Template> = {
  meeting: meetingTemplate,
  note: noteTemplate,
  'interview-as-interviewer': interviewAsInterviewerTemplate,
  'interview-as-candidate': interviewAsCandidateTemplate,
  lecture: lectureTemplate,
}

// sessionType → 默认模板 id。podcast / general 套 note(§6.2:无专用模板)。
export const DEFAULT_SESSION_TO_TEMPLATE: Record<SessionType, TemplateId> = {
  meeting: 'meeting',
  note: 'note',
  'interview-as-interviewer': 'interview-as-interviewer',
  'interview-as-candidate': 'interview-as-candidate',
  lecture: 'lecture',
  podcast: 'note',
  general: 'note',
}

function cloneTemplate(t: Template): Template {
  return {
    ...t,
    sessionTypes: [...t.sessionTypes],
    output: { ...t.output },
    defaultSystemPrompt: t.defaultSystemPrompt ?? t.systemPrompt,
  }
}

export function applyTemplateOverrides(template: Template): Template {
  const base = cloneTemplate(template)
  const override = getSettings().templates.overrides[template.id]
  if (!override) return { ...base, isCustomized: false }

  return {
    ...base,
    systemPrompt: override.systemPrompt ?? base.systemPrompt,
    sessionTypes: override.sessionTypes ? [...override.sessionTypes] : base.sessionTypes,
    isCustomized: !!override.systemPrompt || !!override.sessionTypes,
  }
}

export function listTemplates(): Template[] {
  return TEMPLATE_IDS.map((id) => applyTemplateOverrides(BUILTIN_TEMPLATES[id]))
}

export function getTemplate(id: string): Template | undefined {
  const template = (BUILTIN_TEMPLATES as Record<string, Template>)[id]
  return template ? applyTemplateOverrides(template) : undefined
}

/** 按会话类型选模板(优先用户映射,否则内置默认) */
export function pickTemplate(sessionType: SessionType): Template {
  const mapped = getSettings().templates.templatePerSessionType[sessionType]
  const template = getTemplate(mapped ?? DEFAULT_SESSION_TO_TEMPLATE[sessionType])
  if (template) return template
  const fallback = getTemplate('note')
  if (!fallback) throw new Error('builtin note template missing')
  return fallback
}
