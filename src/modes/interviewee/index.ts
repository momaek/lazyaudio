import type { ModeDefinition } from '../types'
import { BUILTIN_MODE_IDS } from '../types'
import IntervieweeMode from './IntervieweeMode.vue'

/**
 * 面试者模式定义
 */
export const intervieweeMode: ModeDefinition = {
  id: BUILTIN_MODE_IDS.INTERVIEWEE,
  name: '面试者模式',
  description: '实时转录面试问题，AI 提供回答建议',
  icon: '🎯',
  type: 'primary',
  layout: 'floating',
  component: IntervieweeMode,
  capabilities: {
    systemAudio: true,
    microphone: false,
    ai: true,
    markers: false,
  },
  hooks: {
    onActivate: () => {
      console.log('[IntervieweeMode] 激活')
      // TODO: 打开悬浮窗
    },
    onDeactivate: () => {
      console.log('[IntervieweeMode] 停用')
      // TODO: 关闭悬浮窗
    },
  },
}

