<script setup lang="ts">
import { ref } from 'vue'
import MaterialIcon from '@/components/common/MaterialIcon.vue'
import SectionLabel from '@/components/common/SectionLabel.vue'
import { useUiState } from '@/composables/useUiState'

defineProps<{
  sessionId?: string
}>()

const { isAiSidebarOpen, toggleAiSidebar } = useUiState()

// AI 生成内容（模拟数据）
const summaryText = ref(
  'The team discussed Q3 strategy and growth metrics. Mark Chen noted a 15% increase in conversion rates, while Sarah Jenkins shifted focus toward Day 7 retention.'
)

const keyPoints = ref([
  'Conversion rates up 15% in Q3',
  'Day 7 retention is the new priority metric',
  'Setup Wizard correlation needs analysis',
])

const actionItems = ref([
  { id: '1', text: 'Analyze Setup Wizard correlation', completed: false },
  { id: '2', text: 'Prepare full retention report', completed: false },
])

// 输入框
const userInput = ref('')

function handleSubmit() {
  if (!userInput.value.trim()) return
  console.log('[AiInsightSidebar] User query:', userInput.value)
  userInput.value = ''
}

function toggleActionItem(id: string) {
  const item = actionItems.value.find((i) => i.id === id)
  if (item) {
    item.completed = !item.completed
  }
}
</script>

<template>
  <aside
    class="flex flex-col h-full shrink-0 transition-all duration-250 overflow-hidden border-l"
    :class="[isAiSidebarOpen ? 'w-[340px] opacity-100' : 'w-0 opacity-0 border-l-0']"
    style="background-color: var(--la-bg-inset); border-color: var(--la-divider)"
  >
    <!-- Header 48px -->
    <div
      class="h-12 flex items-center justify-between px-4 shrink-0 border-b"
      style="border-color: var(--la-divider)"
    >
      <div class="flex items-center gap-2">
        <MaterialIcon
          name="psychology"
          size="sm"
          style="color: var(--la-ai-purple)"
        />
        <span
          class="text-sm font-semibold"
          style="color: var(--la-text-primary)"
        >
          AI Insights
        </span>
      </div>
      <button
        class="size-7 rounded-md flex items-center justify-center transition-colors"
        style="color: var(--la-text-tertiary)"
        title="收起侧栏"
        @click="toggleAiSidebar"
      >
        <MaterialIcon name="keyboard_double_arrow_right" size="sm" />
      </button>
    </div>

    <!-- 内容区 -->
    <div class="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4">
      <!-- Summary 卡片 -->
      <div class="rounded-[10px] p-4" style="background-color: var(--la-bg-surface)">
        <SectionLabel label="Summary" class="mb-3 block" />
        <p class="text-sm leading-relaxed" style="color: var(--la-text-secondary)">
          {{ summaryText }}
        </p>
      </div>

      <!-- Key Points 卡片 -->
      <div class="rounded-[10px] p-4" style="background-color: var(--la-bg-surface)">
        <SectionLabel label="Key Points" class="mb-3 block" />
        <ul class="space-y-2">
          <li
            v-for="(point, idx) in keyPoints"
            :key="idx"
            class="flex items-start gap-2 text-sm"
          >
            <span class="mt-1.5 size-1.5 rounded-full shrink-0" style="background-color: var(--la-accent)" />
            <span style="color: var(--la-text-secondary)">{{ point }}</span>
          </li>
        </ul>
      </div>

      <!-- Action Items 卡片 -->
      <div class="rounded-[10px] p-4" style="background-color: var(--la-bg-surface)">
        <SectionLabel label="Action Items" class="mb-3 block" />
        <div class="space-y-3">
          <div
            v-for="item in actionItems"
            :key="item.id"
            class="flex items-start gap-2 cursor-pointer group"
            @click="toggleActionItem(item.id)"
          >
            <MaterialIcon
              :name="item.completed ? 'check_box' : 'check_box_outline_blank'"
              size="sm"
              class="mt-0.5 transition-colors"
              :style="{ color: item.completed ? 'var(--la-tier2-green)' : 'var(--la-text-muted)' }"
            />
            <span
              class="text-sm transition-all"
              :style="{
                color: item.completed ? 'var(--la-text-muted)' : 'var(--la-text-secondary)',
                textDecoration: item.completed ? 'line-through' : 'none',
              }"
            >
              {{ item.text }}
            </span>
          </div>
        </div>
      </div>

      <!-- 空状态 (无内容时显示) -->
      <div
        v-if="!summaryText && keyPoints.length === 0"
        class="flex flex-col items-center justify-center py-12 text-center"
      >
        <MaterialIcon
          name="psychology"
          size="xl"
          style="color: var(--la-text-muted)"
          class="mb-3"
        />
        <p class="text-sm" style="color: var(--la-text-tertiary)">
          AI insights will appear here
        </p>
      </div>
    </div>

    <!-- Ask AI 输入框 -->
    <div class="p-4 border-t" style="border-color: var(--la-divider)">
      <div class="relative">
        <input
          v-model="userInput"
          type="text"
          class="w-full rounded-[10px] py-2.5 pl-4 pr-10 text-sm border-0 outline-none"
          style="
            background-color: var(--la-bg-surface);
            color: var(--la-text-primary);
          "
          placeholder="Ask AI anything..."
          @keydown.enter="handleSubmit"
        />
        <button
          class="absolute right-2 top-1/2 -translate-y-1/2 transition-colors"
          style="color: var(--la-ai-purple)"
          @click="handleSubmit"
        >
          <MaterialIcon name="send" size="sm" />
        </button>
      </div>
    </div>
  </aside>
</template>
