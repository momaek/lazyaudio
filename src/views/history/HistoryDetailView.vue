<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Play, Download, Bot, Trash2, Edit2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const route = useRoute()
const router = useRouter()

// 获取 session ID
const sessionId = computed(() => route.params.sessionId as string)

// 模拟数据
const recordDetail = ref({
  id: sessionId.value,
  title: '产品需求评审会议',
  modeId: 'meeting',
  modeName: '会议模式',
  createdAt: '2026-01-06 14:30',
  duration: '45:23',
  wordCount: 3420,
  transcript: `
[00:00:15] 好的，大家好，今天我们来讨论一下新版本的产品需求。

[00:00:32] 主要包括以下几个方面：第一是用户体验优化，第二是性能提升，第三是新功能开发。

[00:01:05] 首先说一下用户体验优化的部分。我们收到了很多用户反馈，说当前的界面操作不够直观...

[00:02:30] 关于性能提升，我们的目标是将启动时间缩短 50%...

[00:05:00] 最后是新功能开发，我们计划在下个版本中加入 AI 助手功能...
  `.trim(),
})

// 返回
function goBack() {
  router.back()
}
</script>

<template>
  <div class="container mx-auto px-4 py-6 max-w-5xl">
    <!-- 标题栏 -->
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-4">
        <Button variant="ghost" size="icon" @click="goBack">
          <ArrowLeft class="h-5 w-5" />
        </Button>
        <div>
          <h1 class="text-xl font-bold flex items-center gap-2">
            {{ recordDetail.title }}
            <Button variant="ghost" size="icon" class="h-6 w-6">
              <Edit2 class="h-3 w-3" />
            </Button>
          </h1>
          <p class="text-sm text-muted-foreground">
            {{ recordDetail.createdAt }} · {{ recordDetail.duration }} · {{ recordDetail.wordCount }} 字
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" class="gap-2">
          <Play class="h-4 w-4" />
          播放录音
        </Button>
        <Button variant="outline" size="sm" class="gap-2">
          <Download class="h-4 w-4" />
          导出
        </Button>
        <Button variant="outline" size="sm" class="gap-2">
          <Bot class="h-4 w-4" />
          AI 分析
        </Button>
        <Button variant="outline" size="sm" class="gap-2 text-destructive hover:text-destructive">
          <Trash2 class="h-4 w-4" />
        </Button>
      </div>
    </div>

    <Separator class="mb-6" />

    <!-- 内容区域 -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- 左侧：转录内容 -->
      <div class="lg:col-span-2">
        <div class="rounded-lg border bg-card p-6">
          <h2 class="font-semibold mb-4">转录内容</h2>
          <div class="prose prose-sm dark:prose-invert max-w-none">
            <pre class="whitespace-pre-wrap font-sans text-sm leading-relaxed">{{ recordDetail.transcript }}</pre>
          </div>
        </div>
      </div>

      <!-- 右侧：AI 分析面板 -->
      <div class="lg:col-span-1">
        <div class="rounded-lg border bg-card p-4 sticky top-4">
          <Tabs default-value="summary">
            <TabsList class="grid w-full grid-cols-3">
              <TabsTrigger value="summary">摘要</TabsTrigger>
              <TabsTrigger value="todos">待办</TabsTrigger>
              <TabsTrigger value="qa">问答</TabsTrigger>
            </TabsList>
            <TabsContent value="summary" class="mt-4">
              <p class="text-sm text-muted-foreground">
                点击"AI 分析"生成会议摘要
              </p>
            </TabsContent>
            <TabsContent value="todos" class="mt-4">
              <p class="text-sm text-muted-foreground">
                点击"AI 分析"提取待办事项
              </p>
            </TabsContent>
            <TabsContent value="qa" class="mt-4">
              <p class="text-sm text-muted-foreground">
                基于转录内容进行问答
              </p>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  </div>
</template>

