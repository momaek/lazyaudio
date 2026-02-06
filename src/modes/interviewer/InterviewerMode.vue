<script setup lang="ts">
import { ref, computed } from 'vue'
import MaterialIcon from '@/components/common/MaterialIcon.vue'
import SectionLabel from '@/components/common/SectionLabel.vue'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'

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
  {
    id: '1',
    speaker: '面试官',
    time: '00:00:10',
    text: '好的，那我们开始今天的面试。首先请你做一个简单的自我介绍。',
  },
  {
    id: '2',
    speaker: '候选人',
    time: '00:00:25',
    text: '好的，我叫张三，毕业于某大学计算机专业，有5年的前端开发经验...',
  },
])

// 笔记
const candidateNotes = ref('')
const candidateRating = ref(0)

const formattedDuration = computed(() => {
  const hours = Math.floor(duration.value / 3600)
  const minutes = Math.floor((duration.value % 3600) / 60)
  const seconds = duration.value % 60

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
})

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

function addMark() {
  // TODO: 添加标记到转录中
  console.log('[InterviewerMode] Mark at', formattedDuration.value)
}

function setRating(stars: number) {
  candidateRating.value = stars
}
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- 空闲态 -->
    <template v-if="!isRecording">
      <div class="flex-1 flex flex-col items-center justify-center p-8 gap-6">
        <!-- 录制按钮 -->
        <div class="relative">
          <div
            class="absolute inset-[-8px] rounded-full opacity-60 animate-pulse"
            style="background-color: var(--la-ai-purple); opacity: 0.2"
          />
          <button
            class="relative size-16 rounded-full flex items-center justify-center transition-transform hover:scale-105"
            style="background-color: var(--la-ai-purple)"
            :disabled="!candidateName.trim()"
            @click="startRecording"
          >
            <MaterialIcon name="record_voice_over" size="lg" style="color: white" />
          </button>
        </div>

        <div class="text-center">
          <h2 class="text-lg font-semibold mb-1" style="color: var(--la-text-primary)">
            准备开始面试
          </h2>
          <p class="text-sm" style="color: var(--la-text-secondary)">
            输入候选人姓名后开始录制
          </p>
        </div>

        <div class="w-full max-w-xs">
          <Input
            v-model="candidateName"
            placeholder="候选人姓名"
            class="text-center border-0"
            :style="{
              backgroundColor: 'var(--la-bg-surface)',
              color: 'var(--la-text-primary)',
            }"
          />
        </div>
      </div>
    </template>

    <!-- 录制态 -->
    <template v-else>
      <!-- Control Bar -->
      <div
        class="h-14 flex items-center px-4 shrink-0 border-b"
        style="background-color: var(--la-bg-inset); border-color: var(--la-divider)"
      >
        <!-- 左区 -->
        <div class="flex items-center gap-3 shrink-0">
          <span
            class="text-xs font-medium px-3 py-1 rounded-full"
            style="background-color: var(--la-bg-surface); color: var(--la-text-secondary)"
          >
            面试: {{ candidateName }}
          </span>
        </div>

        <!-- 中区 -->
        <div class="flex-1 flex items-center justify-center gap-3">
          <button
            v-if="!isPaused"
            class="size-[34px] rounded-full flex items-center justify-center"
            style="background-color: var(--la-bg-surface); color: var(--la-text-secondary)"
            @click="pauseRecording"
          >
            <MaterialIcon name="pause" size="sm" />
          </button>
          <button
            v-else
            class="size-[34px] rounded-full flex items-center justify-center"
            style="background-color: var(--la-bg-surface); color: var(--la-text-secondary)"
            @click="resumeRecording"
          >
            <MaterialIcon name="play_arrow" size="sm" />
          </button>

          <button
            class="size-10 rounded-full flex items-center justify-center"
            style="background-color: var(--la-recording-red)"
            @click="stopRecording"
          >
            <div class="size-3.5 rounded-sm" style="background-color: white" />
          </button>

          <span
            class="text-sm font-mono font-semibold tabular-nums"
            style="color: var(--la-text-primary)"
          >
            {{ formattedDuration }}
          </span>

          <span v-if="!isPaused" class="recording-dot" />
        </div>

        <!-- 右区：Mark 按钮 -->
        <div class="flex items-center gap-2 shrink-0">
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
            style="background-color: var(--la-bg-surface); color: var(--la-text-secondary)"
            @click="addMark"
          >
            <MaterialIcon name="flag" size="sm" />
            Mark
          </button>
        </div>
      </div>

      <!-- 主内容区 -->
      <div class="flex-1 flex min-h-0">
        <!-- 左侧：转录区 -->
        <div class="flex-1 flex flex-col border-r" style="border-color: var(--la-divider)">
          <ScrollArea class="flex-1">
            <div class="px-7 py-6 space-y-4">
              <div
                v-for="item in transcripts"
                :key="item.id"
                class="flex gap-3"
              >
                <span
                  class="shrink-0 px-2 py-0.5 rounded text-xs font-medium"
                  :style="{
                    backgroundColor:
                      item.speaker === '面试官'
                        ? 'color-mix(in srgb, var(--la-ai-purple) 15%, transparent)'
                        : 'var(--la-bg-surface)',
                    color:
                      item.speaker === '面试官'
                        ? 'var(--la-ai-purple)'
                        : 'var(--la-text-secondary)',
                  }"
                >
                  {{ item.speaker }}
                </span>
                <div>
                  <span
                    class="text-xs font-mono"
                    style="color: var(--la-text-tertiary)"
                  >
                    {{ item.time }}
                  </span>
                  <p class="text-sm mt-0.5" style="color: var(--la-text-primary)">
                    {{ item.text }}
                  </p>
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>

        <!-- 右侧：Candidate Notes + Suggested Questions -->
        <div
          class="w-[300px] flex flex-col shrink-0"
          style="background-color: var(--la-bg-inset)"
        >
          <ScrollArea class="flex-1">
            <div class="p-4 space-y-5">
              <!-- Candidate Notes -->
              <div>
                <SectionLabel label="Candidate Notes" class="mb-3 block" />
                <textarea
                  v-model="candidateNotes"
                  class="w-full h-24 rounded-[10px] p-3 text-sm border-0 outline-none resize-none"
                  style="background-color: var(--la-bg-surface); color: var(--la-text-primary)"
                  placeholder="添加面试笔记..."
                />

                <!-- 星级评分 -->
                <div class="flex items-center gap-1 mt-2">
                  <button
                    v-for="i in 5"
                    :key="i"
                    @click="setRating(i)"
                  >
                    <MaterialIcon
                      name="star"
                      size="sm"
                      :fill="i <= candidateRating"
                      :style="{
                        color: i <= candidateRating ? 'var(--la-accent)' : 'var(--la-text-muted)',
                      }"
                    />
                  </button>
                </div>
              </div>

              <!-- 已提问 -->
              <div>
                <SectionLabel :label="`Asked (${askedQuestions.length})`" class="mb-3 block" />
                <div class="space-y-2">
                  <div
                    v-for="q in askedQuestions"
                    :key="q.id"
                    class="p-3 rounded-[10px]"
                    style="background-color: var(--la-bg-surface)"
                  >
                    <p class="text-sm mb-1" style="color: var(--la-text-primary)">
                      {{ q.text }}
                    </p>
                    <span class="text-xs font-mono" style="color: var(--la-text-tertiary)">
                      {{ q.time }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- 推荐问题 -->
              <div>
                <SectionLabel label="Suggested" class="mb-3 block" />
                <div class="space-y-1">
                  <button
                    v-for="q in questionBank"
                    :key="q.id"
                    class="w-full flex items-start gap-2 p-2 rounded-md text-left text-sm transition-colors"
                    style="color: var(--la-text-secondary)"
                    @click="addQuestion(q.text)"
                  >
                    <MaterialIcon name="add" size="sm" class="mt-0.5 shrink-0" style="color: var(--la-accent)" />
                    <span>{{ q.text }}</span>
                  </button>
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>
      </div>
    </template>
  </div>
</template>
