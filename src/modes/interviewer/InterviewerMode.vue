<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  UserSearch,
  Play,
  Pause,
  Square,
  Clock,
  Plus,
  Star,
  MessageSquare,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

// 状态
const isRecording = ref(false)
const isPaused = ref(false)
const duration = ref(0)
const audioLevel = ref(0)
const candidateName = ref('')

// 预设问题库
const questionBank = ref([
  { id: '1', text: '请介绍一下你的工作经历', category: '基础' },
  { id: '2', text: '你认为自己最大的优势是什么？', category: '自我认知' },
  { id: '3', text: '遇到过最大的技术挑战是什么？如何解决的？', category: '技术' },
  { id: '4', text: '你的职业规划是什么？', category: '规划' },
])

// 已提问列表
const askedQuestions = ref([
  { id: '1', text: '请做一下自我介绍', time: '00:01:30', rating: 4 },
  { id: '2', text: '介绍一下你的技术栈', time: '00:05:45', rating: 5 },
])

// 模拟转录
const transcripts = ref([
  { id: '1', speaker: '面试官', time: '00:00:10', text: '好的，那我们开始今天的面试。首先请你做一个简单的自我介绍。' },
  { id: '2', speaker: '候选人', time: '00:00:25', text: '好的，我叫张三，毕业于某大学计算机专业，有5年的前端开发经验...' },
])

const formattedDuration = computed(() => {
  const hours = Math.floor(duration.value / 3600)
  const minutes = Math.floor((duration.value % 3600) / 60)
  const seconds = duration.value % 60
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
})

// 模拟录制
let levelInterval: ReturnType<typeof setInterval> | null = null
let durationInterval: ReturnType<typeof setInterval> | null = null

function startRecording() {
  isRecording.value = true
  isPaused.value = false
  
  levelInterval = setInterval(() => {
    if (!isPaused.value) {
      audioLevel.value = 20 + Math.random() * 60
    }
  }, 100)
  
  durationInterval = setInterval(() => {
    if (!isPaused.value) {
      duration.value++
    }
  }, 1000)
}

function pauseRecording() {
  isPaused.value = true
}

function resumeRecording() {
  isPaused.value = false
}

function stopRecording() {
  isRecording.value = false
  isPaused.value = false
  
  if (levelInterval) {
    clearInterval(levelInterval)
    levelInterval = null
  }
  if (durationInterval) {
    clearInterval(durationInterval)
    durationInterval = null
  }
  
  audioLevel.value = 0
  duration.value = 0
}

function addQuestion(question: string) {
  askedQuestions.value.push({
    id: Date.now().toString(),
    text: question,
    time: formattedDuration.value,
    rating: 0,
  })
}
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- 未录制状态 -->
    <template v-if="!isRecording">
      <div class="flex-1 flex flex-col items-center justify-center p-8">
        <div class="w-24 h-24 rounded-2xl bg-gradient-to-br from-la-violet to-la-purple flex items-center justify-center mb-6 shadow-lg shadow-la-violet/20">
          <UserSearch class="w-12 h-12 text-white" />
        </div>
        
        <h2 class="text-xl font-semibold mb-2">准备开始面试</h2>
        <p class="text-muted-foreground mb-8">输入候选人姓名后开始录制</p>
        
        <!-- 候选人姓名输入 -->
        <div class="w-full max-w-xs mb-6">
          <Input
            v-model="candidateName"
            placeholder="请输入候选人姓名"
            class="text-center bg-card/50 border-border/50"
          />
        </div>
        
        <!-- 开始按钮 -->
        <Button size="lg" class="gap-2 px-8" :disabled="!candidateName.trim()" @click="startRecording">
          <Play class="h-5 w-5" />
          开始面试
        </Button>
      </div>
    </template>

    <!-- 录制中状态 -->
    <template v-else>
      <!-- 控制栏 -->
      <div class="border-b border-border/50 px-4 py-3 flex items-center justify-between shrink-0 bg-card/50">
        <div class="flex items-center gap-4">
          <!-- 录制状态 -->
          <div class="flex items-center gap-2">
            <span v-if="!isPaused" class="relative flex h-3 w-3">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-la-recording opacity-75" />
              <span class="relative inline-flex rounded-full h-3 w-3 bg-la-recording" />
            </span>
            <Pause v-else class="h-3 w-3 text-la-warning" />
            <span class="text-sm font-medium">
              面试: {{ candidateName }}
            </span>
          </div>

          <!-- 音量电平 -->
          <div class="w-24">
            <Progress :model-value="audioLevel" class="h-1.5" />
          </div>

          <!-- 时长 -->
          <div class="flex items-center gap-1.5 text-sm tabular-nums">
            <Clock class="h-3 w-3 text-muted-foreground" />
            {{ formattedDuration }}
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="flex items-center gap-2">
          <Button v-if="!isPaused" variant="secondary" size="sm" @click="pauseRecording">
            <Pause class="h-4 w-4" />
          </Button>
          <Button v-else variant="secondary" size="sm" @click="resumeRecording">
            <Play class="h-4 w-4" />
          </Button>
          <Button variant="destructive" size="sm" class="gap-1" @click="stopRecording">
            <Square class="h-4 w-4" />
            结束面试
          </Button>
        </div>
      </div>

      <!-- 主内容区 -->
      <div class="flex-1 flex min-h-0">
        <!-- 左侧：转录区 -->
        <div class="flex-1 flex flex-col border-r border-border/50">
          <div class="px-4 py-2 text-sm font-medium text-muted-foreground border-b border-border/50">
            实时转录
          </div>
          <ScrollArea class="flex-1">
            <div class="p-4 space-y-4">
              <div
                v-for="item in transcripts"
                :key="item.id"
                class="flex gap-3"
              >
                <Badge
                  variant="outline"
                  :class="[
                    'shrink-0',
                    item.speaker === '面试官' ? 'bg-la-violet/10 text-la-violet border-la-violet/20' : 'bg-secondary',
                  ]"
                >
                  {{ item.speaker }}
                </Badge>
                <div>
                  <span class="text-xs text-muted-foreground">{{ item.time }}</span>
                  <p class="text-sm mt-0.5">{{ item.text }}</p>
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>

        <!-- 右侧：问题跟踪 -->
        <div class="w-80 flex flex-col shrink-0">
          <div class="px-4 py-2 text-sm font-medium text-muted-foreground border-b border-border/50">
            问题追踪
          </div>
          <ScrollArea class="flex-1">
            <div class="p-4 space-y-6">
              <!-- 已提问 -->
              <div>
                <h4 class="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <MessageSquare class="h-3 w-3" />
                  已提问 ({{ askedQuestions.length }})
                </h4>
                <div class="space-y-2">
                  <Card
                    v-for="q in askedQuestions"
                    :key="q.id"
                    class="bg-card/50 border-border/50"
                  >
                    <CardContent class="p-3">
                      <p class="text-sm mb-2">{{ q.text }}</p>
                      <div class="flex items-center justify-between">
                        <span class="text-xs text-muted-foreground">{{ q.time }}</span>
                        <div class="flex gap-0.5">
                          <Star
                            v-for="i in 5"
                            :key="i"
                            class="h-3 w-3"
                            :class="i <= q.rating ? 'text-la-warning fill-la-warning' : 'text-muted-foreground/30'"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              <!-- 推荐问题 -->
              <div>
                <h4 class="text-xs font-medium text-muted-foreground mb-3">推荐问题</h4>
                <div class="space-y-1">
                  <Button
                    v-for="q in questionBank"
                    :key="q.id"
                    variant="ghost"
                    size="sm"
                    class="w-full justify-start text-left h-auto py-2 px-3"
                    @click="addQuestion(q.text)"
                  >
                    <Plus class="h-3 w-3 mr-2 shrink-0" />
                    <span class="truncate">{{ q.text }}</span>
                  </Button>
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>
      </div>
    </template>
  </div>
</template>
