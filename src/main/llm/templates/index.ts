// T51 — 内置模板注册 + 按 sessionType 选模板(transcription-pipeline.md §6.2)。

import type { SessionType } from '@shared/ipc/record'
import type { TemplateId } from '@shared/llm/templates'
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

export function getTemplate(id: string): Template | undefined {
  return (BUILTIN_TEMPLATES as Record<string, Template>)[id]
}

// sessionType → 默认模板 id。podcast / general 套 note(§6.2:无专用模板)。
const SESSION_TO_TEMPLATE: Record<SessionType, TemplateId> = {
  meeting: 'meeting',
  note: 'note',
  'interview-as-interviewer': 'interview-as-interviewer',
  'interview-as-candidate': 'interview-as-candidate',
  lecture: 'lecture',
  podcast: 'note',
  general: 'note',
}

/** 按会话类型选内置模板(用户自定义映射留 T52) */
export function pickTemplate(sessionType: SessionType): Template {
  return BUILTIN_TEMPLATES[SESSION_TO_TEMPLATE[sessionType]]
}
