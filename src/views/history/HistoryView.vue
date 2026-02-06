<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import MaterialIcon from '@/components/common/MaterialIcon.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { useSessionHistory } from '@/composables/useSession'
import { formatRelativeTime, formatDurationFromMs } from '@/lib/formatters'

const router = useRouter()

const { sessions, isLoading, error, deleteHistory, refresh } =
  useSessionHistory()

const searchQuery = ref('')
const modeFilter = ref<string | null>(null)

// 分页
const currentPage = ref(1)
const pageSize = 10

const filteredRecords = computed(() => {
  let result = sessions.value

  if (modeFilter.value) {
    result = result.filter((s) => s.modeId === modeFilter.value)
  }

  if (searchQuery.value.trim()) {
    const query = searchQuery.value.trim().toLowerCase()
    result = result.filter((s) => {
      const name = (s.name || '').toLowerCase()
      return name.includes(query)
    })
  }

  return result
})

const totalCount = computed(() => filteredRecords.value.length)
const paginatedRecords = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredRecords.value.slice(start, start + pageSize)
})
const totalPages = computed(() => Math.ceil(totalCount.value / pageSize))

function getModeIconName(modeId: string): string {
  switch (modeId) {
    case 'meeting': return 'edit_note'
    case 'interviewer': return 'record_voice_over'
    case 'interviewee': return 'person'
    default: return 'edit_note'
  }
}

function getModeName(modeId: string): string {
  switch (modeId) {
    case 'meeting': return 'Meeting'
    case 'interviewer': return 'Interviewer'
    case 'interviewee': return 'Interviewee'
    default: return modeId
  }
}

function viewDetail(id: string) {
  router.push(`/history/${id}`)
}

async function handleDelete(id: string, event: Event) {
  event.stopPropagation()
  if (confirm('确定要删除这条记录吗？')) {
    await deleteHistory(id)
  }
}

function toggleFilter(modeId: string) {
  modeFilter.value = modeFilter.value === modeId ? null : modeId
  currentPage.value = 1
}

function goToPage(page: number) {
  currentPage.value = page
}
</script>

<template>
  <div class="flex flex-col p-6 gap-6 overflow-y-auto h-full">
    <!-- 工具栏 -->
    <div class="flex items-center gap-4">
      <!-- 搜索框 -->
      <div class="relative w-80">
        <MaterialIcon
          name="search"
          size="sm"
          class="absolute left-3 top-1/2 -translate-y-1/2"
          style="color: var(--la-text-tertiary)"
        />
        <input
          v-model="searchQuery"
          placeholder="搜索会议名称..."
          class="w-full h-9 pl-9 pr-4 rounded-md text-sm border-0 outline-none"
          style="background-color: var(--la-bg-surface); color: var(--la-text-primary)"
        />
      </div>

      <!-- 过滤标签 -->
      <div class="flex gap-1">
        <button
          class="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
          :style="
            modeFilter === null
              ? { backgroundColor: 'var(--la-accent)', color: 'var(--la-text-inverted)' }
              : { backgroundColor: 'var(--la-bg-surface)', color: 'var(--la-text-secondary)' }
          "
          @click="modeFilter = null; currentPage = 1"
        >
          All
        </button>
        <button
          class="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
          :style="
            modeFilter === 'meeting'
              ? { backgroundColor: 'var(--la-accent)', color: 'var(--la-text-inverted)' }
              : { backgroundColor: 'var(--la-bg-surface)', color: 'var(--la-text-secondary)' }
          "
          @click="toggleFilter('meeting')"
        >
          Meeting
        </button>
        <button
          class="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
          :style="
            modeFilter === 'interviewer'
              ? { backgroundColor: 'var(--la-accent)', color: 'var(--la-text-inverted)' }
              : { backgroundColor: 'var(--la-bg-surface)', color: 'var(--la-text-secondary)' }
          "
          @click="toggleFilter('interviewer')"
        >
          Interviewer
        </button>
      </div>
    </div>

    <!-- 加载状态 -->
    <div
      v-if="isLoading && sessions.length === 0"
      class="flex-1 flex items-center justify-center"
    >
      <MaterialIcon
        name="progress_activity"
        size="xl"
        class="animate-spin"
        style="color: var(--la-text-tertiary)"
      />
    </div>

    <!-- 错误状态 -->
    <div
      v-else-if="error"
      class="flex-1 flex flex-col items-center justify-center gap-3"
    >
      <MaterialIcon name="error" size="xl" style="color: var(--la-recording-red); opacity: 0.5" />
      <p class="text-sm" style="color: var(--la-text-secondary)">{{ error }}</p>
      <button
        class="px-4 py-1.5 rounded-md text-xs font-medium"
        style="background-color: var(--la-bg-surface); color: var(--la-text-secondary)"
        @click="refresh"
      >
        重试
      </button>
    </div>

    <!-- 列表 -->
    <div v-else-if="filteredRecords.length > 0" class="flex flex-col gap-2">
      <div
        v-for="record in paginatedRecords"
        :key="record.id"
        class="flex items-center gap-4 p-4 rounded-[10px] cursor-pointer transition-colors"
        style="background-color: var(--la-bg-surface)"
        @click="viewDetail(record.id)"
      >
        <!-- 模式图标 -->
        <div
          class="size-10 rounded-[10px] flex items-center justify-center shrink-0"
          style="background-color: var(--la-bg-inset); color: var(--la-text-secondary)"
        >
          <MaterialIcon :name="getModeIconName(record.modeId)" size="md" />
        </div>

        <!-- 标题 + 元数据 -->
        <div class="flex-1 min-w-0">
          <h3
            class="text-sm font-medium truncate"
            style="color: var(--la-text-primary)"
          >
            {{ record.name || '未命名会议' }}
          </h3>
          <div class="flex items-center gap-3 mt-1">
            <span class="text-xs" style="color: var(--la-text-tertiary)">
              {{ getModeName(record.modeId) }}
            </span>
            <span class="text-xs" style="color: var(--la-text-tertiary)">
              {{ formatRelativeTime(record.createdAt) }}
            </span>
            <span class="text-xs font-mono" style="color: var(--la-text-tertiary)">
              {{ formatDurationFromMs(record.durationMs) }}
            </span>
            <span
              v-if="record.wordCount > 0"
              class="text-xs"
              style="color: var(--la-text-tertiary)"
            >
              {{ record.wordCount }} 字
            </span>
          </div>
        </div>

        <!-- 状态 -->
        <StatusBadge status="completed" />

        <!-- 删除 -->
        <button
          class="size-8 rounded-md flex items-center justify-center transition-colors shrink-0"
          style="color: var(--la-text-muted)"
          @click.stop="handleDelete(record.id, $event)"
        >
          <MaterialIcon name="delete" size="sm" />
        </button>
      </div>
    </div>

    <!-- 空状态 -->
    <div
      v-else
      class="flex-1 flex flex-col items-center justify-center gap-3"
    >
      <MaterialIcon name="history" size="xl" style="color: var(--la-text-muted)" />
      <p class="text-sm font-medium" style="color: var(--la-text-secondary)">
        {{ searchQuery ? '未找到匹配结果' : 'No sessions yet' }}
      </p>
      <p class="text-xs" style="color: var(--la-text-tertiary)">
        {{ searchQuery ? '尝试其他关键词' : '开始录制后，记录将显示在这里' }}
      </p>
    </div>

    <!-- 分页 -->
    <div
      v-if="totalCount > 0"
      class="flex items-center justify-between pt-2"
    >
      <span class="text-xs" style="color: var(--la-text-tertiary)">
        Showing {{ Math.min((currentPage - 1) * pageSize + 1, totalCount) }}-{{ Math.min(currentPage * pageSize, totalCount) }} of {{ totalCount }} sessions
      </span>
      <div class="flex items-center gap-1">
        <button
          v-for="page in totalPages"
          :key="page"
          class="size-8 rounded-md flex items-center justify-center text-xs font-medium transition-colors"
          :style="
            page === currentPage
              ? { backgroundColor: 'var(--la-accent)', color: 'var(--la-text-inverted)' }
              : { color: 'var(--la-text-secondary)' }
          "
          @click="goToPage(page)"
        >
          {{ page }}
        </button>
      </div>
    </div>
  </div>
</template>
