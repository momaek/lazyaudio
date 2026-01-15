<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useModeStore } from '@/stores/mode'
import { useAppStore } from '@/stores/app'
import MaterialIcon from '@/components/common/MaterialIcon.vue'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'

const router = useRouter()
const modeStore = useModeStore()
const appStore = useAppStore()

// Mode 卡片配置
const modeCards = [
  {
    id: 'meeting',
    name: '会议模式',
    description: '记录会议内容，自动生成摘要和待办事项',
    iconName: 'video_chat',
    borderColor: 'hover:border-brand-primary/50 dark:hover:border-primary-bright/30',
    iconBg: 'bg-brand-primary/10 dark:bg-primary-bright/10',
    iconColor: 'text-brand-primary dark:text-primary-bright',
  },
  {
    id: 'interviewer',
    name: '面试官模式',
    description: '记录面试过程，追踪问题和评价候选人',
    iconName: 'record_voice_over',
    borderColor: 'hover:border-primary-light/50',
    iconBg: 'bg-primary-light/10',
    iconColor: 'text-primary-light',
  },
  {
    id: 'interviewee',
    name: '面试者模式',
    description: '实时转录面试问题，AI 提供回答建议',
    iconName: 'person',
    borderColor: 'hover:border-warning/50',
    iconBg: 'bg-warning/10',
    iconColor: 'text-warning',
  },
]

// 选择模式
async function selectMode(modeId: string) {
  const success = await modeStore.switchPrimaryMode(modeId)
  if (success) {
    appStore.setLastMode(modeId)
    router.push(`/mode/${modeId}`)
  }
}
</script>

<template>
  <div class="container mx-auto px-4 py-12 max-w-4xl">
    <!-- 欢迎区域 -->
    <div class="text-center mb-12">
      <div class="inline-flex items-center justify-center w-20 h-20 rounded-2xl la-gradient mb-6 shadow-lg shadow-brand-primary/20">
        <MaterialIcon name="graphic_eq" size="2xl" class="text-white" />
      </div>
      <h1 class="text-3xl font-bold mb-3 font-display">
        欢迎使用 <span class="la-gradient-text">LazyAudio</span>
      </h1>
      <p class="text-lg text-text-muted dark:text-text-muted-dark">
        选择一个模式开始使用
      </p>
    </div>

    <!-- 模式选择卡片 -->
    <div class="grid gap-4 md:grid-cols-3 mb-12">
      <Card
        v-for="mode in modeCards"
        :key="mode.id"
        class="cursor-pointer transition-all duration-200 bg-white/50 dark:bg-card/50 border-border-light/50 dark:border-border/50 hover:bg-white/80 dark:hover:bg-card/80 hover:shadow-md"
        :class="mode.borderColor"
        @click="selectMode(mode.id)"
      >
        <CardHeader class="text-center pb-2">
          <div
            class="inline-flex items-center justify-center w-14 h-14 rounded-xl mx-auto mb-3"
            :class="mode.iconBg"
          >
            <MaterialIcon
              :name="mode.iconName"
              size="xl"
              :class="mode.iconColor"
            />
          </div>
          <CardTitle class="text-lg font-display">{{ mode.name }}</CardTitle>
        </CardHeader>
        <CardContent class="text-center pb-6">
          <CardDescription class="text-sm">
            {{ mode.description }}
          </CardDescription>
        </CardContent>
      </Card>
    </div>

    <!-- 快速开始 -->
    <div class="text-center">
      <Button
        v-if="modeStore.currentPrimaryModeId"
        size="lg"
        class="gap-2"
        @click="router.push(`/mode/${modeStore.currentPrimaryModeId}`)"
      >
        继续上次的模式
        <MaterialIcon name="arrow_forward" size="sm" />
      </Button>
    </div>
  </div>
</template>
