<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import MaterialIcon from '@/components/common/MaterialIcon.vue'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAudioSources } from '@/composables/useAudio'
import { useSessionHistory } from '@/composables/useSession'
import { BUILTIN_MODE_IDS } from '@/modes/types'
import { formatRelativeTime, formatDurationFromMs } from '@/lib/formatters'

const emit = defineEmits<{
  start: [audioSource: string, mergeForAsr: boolean]
}>()

defineProps<{
  isLoading: boolean
  error: string | null
}>()

const router = useRouter()

const {
  refreshSources,
  forceRefreshSystemSources,
  isLoading: sourcesLoading,
} = useAudioSources()

const {
  sessions: recentSessions,
  isLoading: historyLoading,
  loadHistory,
} = useSessionHistory()

// 音频源选择
const selectedAudioSource = ref('both')
const mergeForAsr = ref(false)
const audioSourceOptions = [
  { value: 'system', label: '系统音频', iconName: 'laptop_mac' },
  { value: 'microphone', label: '麦克风', iconName: 'mic' },
  { value: 'both', label: '系统+麦克风', iconName: 'volume_up' },
]

watch(selectedAudioSource, (value) => {
  if (value !== 'both') {
    mergeForAsr.value = false
  }
})

const recentMeetings = computed(() => {
  return recentSessions.value
    .filter((s) => s.modeId === BUILTIN_MODE_IDS.MEETING)
    .slice(0, 5)
    .map((s) => ({
      id: s.id,
      title: s.name || '未命名会议',
      time: formatRelativeTime(s.createdAt),
      duration: formatDurationFromMs(s.durationMs),
    }))
})

function startRecording() {
  emit('start', selectedAudioSource.value, mergeForAsr.value)
}

function viewMeeting(id: string) {
  router.push(`/history/${id}`)
}

onMounted(async () => {
  await refreshSources()
  await loadHistory(true)
})
</script>

<template>
  <div class="flex-1 flex flex-col items-center justify-center p-8 gap-6">
    <!-- 录制按钮 -->
    <div class="relative">
      <!-- 外圈脉冲 -->
      <div
        class="absolute inset-[-8px] rounded-full opacity-60 animate-pulse"
        style="background-color: var(--la-recording-red-dim)"
      />
      <button
        class="relative size-16 rounded-full flex items-center justify-center transition-transform hover:scale-105"
        style="background-color: var(--la-recording-red)"
        :disabled="isLoading || sourcesLoading"
        @click="startRecording"
      >
        <MaterialIcon
          v-if="isLoading"
          name="progress_activity"
          size="lg"
          class="animate-spin"
          style="color: white"
        />
        <MaterialIcon v-else name="mic" size="lg" style="color: white" />
      </button>
    </div>

    <div class="text-center">
      <h2 class="text-lg font-semibold mb-1" style="color: var(--la-text-primary)">
        准备开始会议转录
      </h2>
      <p class="text-sm" style="color: var(--la-text-secondary)">
        选择音频源后点击录制按钮
      </p>
    </div>

    <!-- 音频源选择下拉 -->
    <div
      class="w-full max-w-xs rounded-xl p-4 flex flex-col gap-3"
      style="background-color: var(--la-bg-surface)"
    >
      <div class="flex items-center gap-2">
        <Select v-model="selectedAudioSource" class="flex-1">
          <SelectTrigger
            class="border-0"
            style="background-color: var(--la-bg-inset); color: var(--la-text-primary)"
          >
            <SelectValue placeholder="选择音频源" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="option in audioSourceOptions"
              :key="option.value"
              :value="option.value"
            >
              <div class="flex items-center gap-2">
                <MaterialIcon :name="option.iconName" size="sm" />
                {{ option.label }}
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
        <button
          class="size-8 rounded-md flex items-center justify-center transition-colors"
          style="background-color: var(--la-bg-inset); color: var(--la-text-secondary)"
          :disabled="sourcesLoading"
          title="刷新音频源"
          @click="forceRefreshSystemSources"
        >
          <MaterialIcon
            name="refresh"
            size="sm"
            :class="{ 'animate-spin': sourcesLoading }"
          />
        </button>
      </div>

      <div
        v-if="selectedAudioSource === 'both'"
        class="flex items-center justify-between text-sm"
      >
        <span style="color: var(--la-text-secondary)">合并转录</span>
        <Switch v-model:checked="mergeForAsr" />
      </div>
    </div>

    <!-- 错误提示 -->
    <p
      v-if="error"
      class="text-sm px-4 py-2 rounded-lg"
      style="background-color: color-mix(in srgb, var(--la-recording-red) 10%, transparent); color: var(--la-recording-red)"
    >
      {{ error }}
    </p>

    <!-- 最近会议 -->
    <div v-if="recentMeetings.length > 0" class="w-full max-w-md mt-4">
      <span class="section-label mb-3 block">最近会议</span>
      <div class="flex flex-col gap-2">
        <button
          v-for="meeting in recentMeetings"
          :key="meeting.id"
          class="flex items-center gap-3 p-3 rounded-[10px] transition-colors text-left"
          style="background-color: var(--la-bg-surface)"
          @click="viewMeeting(meeting.id)"
        >
          <MaterialIcon name="description" size="sm" style="color: var(--la-text-tertiary)" />
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate" style="color: var(--la-text-primary)">
              {{ meeting.title }}
            </p>
            <p class="text-xs" style="color: var(--la-text-tertiary)">{{ meeting.time }}</p>
          </div>
          <span
            class="text-xs font-mono tabular-nums"
            style="color: var(--la-text-tertiary)"
          >
            {{ meeting.duration }}
          </span>
        </button>
      </div>
    </div>

    <!-- 空状态 -->
    <div
      v-else-if="!historyLoading"
      class="w-full max-w-md mt-4 text-center"
    >
      <p class="text-sm" style="color: var(--la-text-tertiary)">
        还没有会议记录，开始你的第一次会议吧！
      </p>
    </div>
  </div>
</template>
