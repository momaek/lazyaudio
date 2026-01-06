import type { ModeDefinition } from '../types'
import { BUILTIN_MODE_IDS } from '../types'
import InterviewerMode from './InterviewerMode.vue'

/**
 * 面试官模式定义
 */
export const interviewerMode: ModeDefinition = {
  id: BUILTIN_MODE_IDS.INTERVIEWER,
  name: '面试官模式',
  description: '记录面试过程，追踪问题和评价候选人',
  icon: '👔',
  type: 'primary',
  layout: 'default',
  component: InterviewerMode,
  capabilities: {
    systemAudio: true,
    microphone: true,
    ai: true,
    markers: true,
  },
  hooks: {
    onActivate: () => {
      console.log('[InterviewerMode] 激活')
    },
    onDeactivate: () => {
      console.log('[InterviewerMode] 停用')
    },
  },
}

