<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useModeStore } from '@/stores/mode'
import { useAppStore } from '@/stores/app'
import { Mic, UserSearch, User, ArrowRight, Wrench } from 'lucide-vue-next'
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
    icon: Mic,
    gradient: 'from-la-indigo to-la-violet',
    borderColor: 'hover:border-la-indigo/50',
    iconBg: 'bg-la-indigo/10',
    iconColor: 'text-la-indigo',
  },
  {
    id: 'interviewer',
    name: '面试官模式',
    description: '记录面试过程，追踪问题和评价候选人',
    icon: UserSearch,
    gradient: 'from-la-violet to-la-purple',
    borderColor: 'hover:border-la-violet/50',
    iconBg: 'bg-la-violet/10',
    iconColor: 'text-la-violet',
  },
  {
    id: 'interviewee',
    name: '面试者模式',
    description: '实时转录面试问题，AI 提供回答建议',
    icon: User,
    gradient: 'from-la-warning to-orange-500',
    borderColor: 'hover:border-la-warning/50',
    iconBg: 'bg-la-warning/10',
    iconColor: 'text-la-warning',
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

// 进入开发测试
function goToAudioTest() {
  router.push('/dev/audio-test')
}
</script>

<template>
  <div class="container mx-auto px-4 py-12 max-w-4xl">
    <!-- 欢迎区域 -->
    <div class="text-center mb-12">
      <div class="inline-flex items-center justify-center w-20 h-20 rounded-2xl la-gradient mb-6 shadow-lg shadow-la-indigo/20">
        <span class="text-4xl">🎙️</span>
      </div>
      <h1 class="text-3xl font-bold mb-3">
        欢迎使用 <span class="la-gradient-text">LazyAudio</span>
      </h1>
      <p class="text-lg text-muted-foreground">
        选择一个模式开始使用
      </p>
    </div>

    <!-- 模式选择卡片 -->
    <div class="grid gap-4 md:grid-cols-3 mb-12">
      <Card
        v-for="mode in modeCards"
        :key="mode.id"
        class="cursor-pointer transition-all duration-200 bg-card/50 border-border/50 hover:bg-card/80"
        :class="mode.borderColor"
        @click="selectMode(mode.id)"
      >
        <CardHeader class="text-center pb-2">
          <div
            class="inline-flex items-center justify-center w-14 h-14 rounded-xl mx-auto mb-3"
            :class="mode.iconBg"
          >
            <component
              :is="mode.icon"
              class="w-7 h-7"
              :class="mode.iconColor"
            />
          </div>
          <CardTitle class="text-lg">{{ mode.name }}</CardTitle>
        </CardHeader>
        <CardContent class="text-center pb-6">
          <CardDescription class="text-sm">
            {{ mode.description }}
          </CardDescription>
        </CardContent>
      </Card>
    </div>

    <!-- 快速开始 -->
    <div class="text-center mb-8">
      <Button
        v-if="modeStore.currentPrimaryModeId"
        size="lg"
        class="gap-2"
        @click="router.push(`/mode/${modeStore.currentPrimaryModeId}`)"
      >
        继续上次的模式
        <ArrowRight class="w-4 h-4" />
      </Button>
    </div>

    <!-- 开发测试入口 -->
    <div class="border-t border-border/50 pt-8">
      <p class="text-sm text-muted-foreground text-center mb-4">开发者工具</p>
      <div class="flex justify-center">
        <Button variant="outline" class="gap-2 text-muted-foreground" @click="goToAudioTest">
          <Wrench class="w-4 h-4" />
          音频采集测试
        </Button>
      </div>
    </div>
  </div>
</template>
