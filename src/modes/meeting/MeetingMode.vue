<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  Mic,
  Play,
  Pause,
  Square,
  Flag,
  Edit2,
  Volume2,
  Monitor,
  Clock,
  FileText,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const router = useRouter()

// 状态
const isRecording = ref(false)
const isPaused = ref(false)
const duration = ref(0)
const audioLevel = ref(0)
const autoScroll = ref(true)

// 音频源选项
const audioSourceOptions = [
  { value: 'system', label: '系统音频', icon: Monitor },
  { value: 'microphone', label: '麦克风', icon: Mic },
  { value: 'both', label: '系统音频+麦克风', icon: Volume2 },
]
const selectedAudioSource = ref('both')

// 模拟转录数据
const transcripts = ref([
  { id: '1', time: '00:00:15', text: '好的，大家好，今天我们来讨论一下新版本的产品需求。' },
  { id: '2', time: '00:00:32', text: '主要包括以下几个方面：第一是用户体验优化，第二是性能提升，第三是新功能开发。' },
  { id: '3', time: '00:01:05', text: '首先说一下用户体验优化的部分。我们收到了很多用户反馈，说当前的界面操作不够直观...' },
])

// 最近会议
const recentMeetings = ref([
  { id: '1', title: '产品需求评审会议', time: '今天 14:30', duration: '45:23' },
  { id: '2', title: '技术方案讨论', time: '昨天 10:00', duration: '32:10' },
  { id: '3', title: '周会', time: '1月3日 09:00', duration: '28:45' },
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

// 模拟音量变化
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

function addMarker() {
  console.log('添加标记')
}

function renameSession() {
  console.log('重命名')
}

function viewMeeting(id: string) {
  router.push(`/history/${id}`)
}
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- 未录制状态 -->
    <template v-if="!isRecording">
      <div class="flex-1 flex flex-col items-center justify-center p-8">
        <!-- 图标 -->
        <div class="w-24 h-24 rounded-2xl la-gradient flex items-center justify-center mb-6 shadow-lg shadow-la-indigo/20">
          <Mic class="w-12 h-12 text-white" />
        </div>
        
        <h2 class="text-xl font-semibold mb-2">准备开始会议转录</h2>
        <p class="text-muted-foreground mb-8">选择音频源后开始录制</p>
        
        <!-- 音频源选择 -->
        <div class="w-full max-w-xs mb-6">
          <Select v-model="selectedAudioSource">
            <SelectTrigger class="bg-card/50 border-border/50">
              <SelectValue placeholder="选择音频源" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="option in audioSourceOptions"
                :key="option.value"
                :value="option.value"
              >
                <div class="flex items-center gap-2">
                  <component :is="option.icon" class="h-4 w-4 text-muted-foreground" />
                  {{ option.label }}
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <!-- 开始按钮 -->
        <Button size="lg" class="gap-2 px-8" @click="startRecording">
          <Play class="h-5 w-5" />
          开始录制
        </Button>
        
        <!-- 最近会议 -->
        <div class="w-full max-w-md mt-12">
          <h3 class="text-sm font-medium text-muted-foreground mb-4">最近会议</h3>
          <div class="space-y-2">
            <Card
              v-for="meeting in recentMeetings"
              :key="meeting.id"
              class="cursor-pointer bg-card/50 border-border/50 hover:bg-card/80 transition-colors"
              @click="viewMeeting(meeting.id)"
            >
              <CardContent class="p-3 flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <FileText class="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p class="text-sm font-medium">{{ meeting.title }}</p>
                    <p class="text-xs text-muted-foreground">{{ meeting.time }}</p>
                  </div>
                </div>
                <span class="text-xs text-muted-foreground tabular-nums">{{ meeting.duration }}</span>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </template>

    <!-- 录制中状态 -->
    <template v-else>
      <!-- 控制栏 -->
      <div class="border-b border-border/50 px-4 py-3 flex items-center justify-between shrink-0 bg-card/50">
        <div class="flex items-center gap-4">
          <!-- 录制状态 -->
          <div class="flex items-center gap-2">
            <span
              v-if="!isPaused"
              class="relative flex h-3 w-3"
            >
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-la-recording opacity-75" />
              <span class="relative inline-flex rounded-full h-3 w-3 bg-la-recording" />
            </span>
            <Pause v-else class="h-3 w-3 text-la-warning" />
            <span class="text-sm font-medium">
              {{ isPaused ? '已暂停' : '录制中' }}
            </span>
          </div>

          <!-- 音频源 -->
          <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Volume2 class="h-3 w-3" />
            <span>系统音频+麦克风</span>
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
          <Button
            v-if="!isPaused"
            variant="secondary"
            size="sm"
            class="gap-1"
            @click="pauseRecording"
          >
            <Pause class="h-4 w-4" />
            暂停
          </Button>
          <Button
            v-else
            variant="secondary"
            size="sm"
            class="gap-1"
            @click="resumeRecording"
          >
            <Play class="h-4 w-4" />
            继续
          </Button>
          <Button
            variant="secondary"
            size="sm"
            class="gap-1"
            @click="addMarker"
          >
            <Flag class="h-4 w-4" />
            标记
          </Button>
          <Button
            variant="secondary"
            size="sm"
            class="gap-1"
            @click="renameSession"
          >
            <Edit2 class="h-4 w-4" />
          </Button>
          <Button
            variant="destructive"
            size="sm"
            class="gap-1"
            @click="stopRecording"
          >
            <Square class="h-4 w-4" />
            结束
          </Button>
        </div>
      </div>

      <!-- 转录区 -->
      <ScrollArea class="flex-1">
        <div class="p-4 space-y-4">
          <div
            v-for="item in transcripts"
            :key="item.id"
            class="flex gap-4"
          >
            <span class="text-xs text-muted-foreground tabular-nums shrink-0 pt-0.5">
              {{ item.time }}
            </span>
            <p class="text-sm leading-relaxed">
              {{ item.text }}
            </p>
          </div>

          <!-- 实时输入指示 -->
          <div v-if="!isPaused" class="flex gap-4">
            <span class="text-xs text-muted-foreground tabular-nums shrink-0 pt-0.5">
              {{ formattedDuration }}
            </span>
            <p class="text-sm leading-relaxed text-muted-foreground">
              <span class="inline-block w-0.5 h-4 bg-la-indigo animate-pulse" />
            </p>
          </div>
        </div>
      </ScrollArea>

      <!-- 底部提示 -->
      <div class="border-t border-border/50 px-4 py-2 flex items-center justify-end text-xs text-muted-foreground bg-card/30">
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            v-model="autoScroll"
            type="checkbox"
            class="rounded border-border"
          />
          自动滚动
        </label>
      </div>
    </template>
  </div>
</template>
