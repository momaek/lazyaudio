// T51 — 内置模板 id + 显示名(renderer 用 id→name 显示「用 X 模板」)。
// 完整 prompt 在 main 侧 src/main/llm/templates/*(不进 renderer bundle)。

export const TEMPLATE_IDS = [
  'meeting',
  'note',
  'interview-as-interviewer',
  'interview-as-candidate',
  'lecture',
] as const
export type TemplateId = (typeof TEMPLATE_IDS)[number]

export const TEMPLATE_NAMES: Record<TemplateId, string> = {
  meeting: '会议纪要',
  note: '要点速记',
  'interview-as-interviewer': '候选人评估',
  'interview-as-candidate': '自我复盘',
  lecture: '章节笔记',
}

export function templateName(id: string): string {
  return (TEMPLATE_NAMES as Record<string, string>)[id] ?? id
}
