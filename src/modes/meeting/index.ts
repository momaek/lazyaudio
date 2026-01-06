import type { ModeDefinition } from '../types'
import { BUILTIN_MODE_IDS } from '../types'
import MeetingMode from './MeetingMode.vue'

/**
 * 会议模式定义
 */
export const meetingMode: ModeDefinition = {
  id: BUILTIN_MODE_IDS.MEETING,
  name: '会议模式',
  description: '记录会议内容，自动生成摘要和待办事项',
  icon: '📝',
  type: 'primary',
  layout: 'default',
  component: MeetingMode,
  capabilities: {
    systemAudio: true,
    microphone: true,
    ai: true,
    markers: true,
  },
  hooks: {
    onActivate: () => {
      console.log('[MeetingMode] 激活')
    },
    onDeactivate: () => {
      console.log('[MeetingMode] 停用')
    },
  },
}

