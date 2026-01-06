<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, Search, Filter, Mic, UserSearch, User, Calendar, Clock, FileText } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const router = useRouter()

// 搜索关键词
const searchQuery = ref('')

// 模拟历史记录数据
const historyRecords = ref([
  {
    id: '1',
    title: '产品需求评审会议',
    modeId: 'meeting',
    modeName: '会议模式',
    createdAt: '2026-01-06 14:30',
    duration: '45:23',
    wordCount: 3420,
    preview: '今天我们来讨论一下新版本的产品需求，主要包括以下几个方面...',
  },
  {
    id: '2',
    title: '前端工程师面试 - 张三',
    modeId: 'interviewer',
    modeName: '面试官模式',
    createdAt: '2026-01-05 10:00',
    duration: '52:10',
    wordCount: 4200,
    preview: '请先做一下自我介绍...',
  },
])

// 获取模式图标
function getModeIcon(modeId: string) {
  switch (modeId) {
    case 'meeting':
      return Mic
    case 'interviewer':
      return UserSearch
    case 'interviewee':
      return User
    default:
      return Mic
  }
}

// 获取模式颜色
function getModeColor(modeId: string) {
  switch (modeId) {
    case 'meeting':
      return 'bg-la-indigo/10 text-la-indigo'
    case 'interviewer':
      return 'bg-la-violet/10 text-la-violet'
    case 'interviewee':
      return 'bg-la-warning/10 text-la-warning'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

// 返回
function goBack() {
  router.back()
}

// 查看详情
function viewDetail(id: string) {
  router.push(`/history/${id}`)
}
</script>

<template>
  <div class="container mx-auto px-4 py-6 max-w-4xl">
    <!-- 标题栏 -->
    <div class="flex items-center gap-4 mb-6">
      <Button variant="ghost" size="icon" class="text-muted-foreground" @click="goBack">
        <ArrowLeft class="h-5 w-5" />
      </Button>
      <h1 class="text-2xl font-bold">历史记录</h1>
    </div>

    <!-- 搜索和筛选 -->
    <div class="flex gap-4 mb-6">
      <div class="relative flex-1">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          v-model="searchQuery"
          placeholder="搜索转录内容..."
          class="pl-10 bg-card/50 border-border/50"
        />
      </div>
      <Button variant="outline" class="gap-2">
        <Filter class="h-4 w-4" />
        筛选
      </Button>
    </div>

    <!-- 记录列表 -->
    <div v-if="historyRecords.length > 0" class="space-y-3">
      <Card
        v-for="record in historyRecords"
        :key="record.id"
        class="cursor-pointer bg-card/50 border-border/50 hover:bg-card/80 transition-colors"
        @click="viewDetail(record.id)"
      >
        <CardContent class="p-4">
          <div class="flex items-start justify-between mb-2">
            <div class="flex items-center gap-3">
              <div :class="['p-2 rounded-lg', getModeColor(record.modeId)]">
                <component :is="getModeIcon(record.modeId)" class="h-4 w-4" />
              </div>
              <div>
                <h3 class="font-medium">{{ record.title }}</h3>
                <Badge variant="secondary" class="text-xs mt-1">
                  {{ record.modeName }}
                </Badge>
              </div>
            </div>
          </div>
          <p class="text-sm text-muted-foreground line-clamp-2 ml-11">
            {{ record.preview }}
          </p>
        </CardContent>
        <CardFooter class="px-4 py-2 border-t border-border/50 text-xs text-muted-foreground gap-4">
          <span class="flex items-center gap-1">
            <Calendar class="h-3 w-3" />
            {{ record.createdAt }}
          </span>
          <span class="flex items-center gap-1">
            <Clock class="h-3 w-3" />
            {{ record.duration }}
          </span>
          <span class="flex items-center gap-1">
            <FileText class="h-3 w-3" />
            {{ record.wordCount }} 字
          </span>
        </CardFooter>
      </Card>
    </div>

    <!-- 空状态 -->
    <div
      v-else
      class="flex flex-col items-center justify-center py-16 text-muted-foreground"
    >
      <FileText class="h-12 w-12 mb-4 opacity-50" />
      <p class="text-lg font-medium mb-2">暂无历史记录</p>
      <p class="text-sm">开始录制后，记录将显示在这里</p>
    </div>
  </div>
</template>
