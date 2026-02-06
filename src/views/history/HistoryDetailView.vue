<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MaterialIcon from '@/components/common/MaterialIcon.vue'

const route = useRoute()
const router = useRouter()

const sessionId = computed(() => route.params.sessionId as string)

function goBack() {
  router.back()
}

// 模拟数据
const recordDetail = ref({
  id: sessionId.value,
  title: '产品需求评审会议',
  modeId: 'meeting',
  modeName: 'Meeting',
  createdAt: '2026-01-06 14:30',
  duration: '45:23',
  wordCount: 3420,
  transcript: `[00:00:15] 好的，大家好，今天我们来讨论一下新版本的产品需求。

[00:00:32] 主要包括以下几个方面：第一是用户体验优化，第二是性能提升，第三是新功能开发。

[00:01:05] 首先说一下用户体验优化的部分。我们收到了很多用户反馈，说当前的界面操作不够直观...

[00:02:30] 关于性能提升，我们的目标是将启动时间缩短 50%...

[00:05:00] 最后是新功能开发，我们计划在下个版本中加入 AI 助手功能...`,
})

const activeTab = ref('transcript')
</script>

<template>
  <div class="flex flex-col p-6 gap-6 overflow-y-auto h-full">
    <!-- Session Info Card -->
    <div
      class="rounded-xl p-6"
      style="background-color: var(--la-bg-surface)"
    >
      <div class="flex items-start justify-between">
        <div class="flex items-start gap-3">
          <button
            class="size-8 rounded-md flex items-center justify-center shrink-0 mt-0.5"
            style="color: var(--la-text-secondary)"
            @click="goBack"
          >
            <MaterialIcon name="arrow_back" size="sm" />
          </button>
          <div>
          <h1 class="text-lg font-semibold mb-1" style="color: var(--la-text-primary)">
            {{ recordDetail.title }}
          </h1>
          <div class="flex items-center gap-4">
            <span class="text-xs" style="color: var(--la-text-tertiary)">
              {{ recordDetail.modeName }}
            </span>
            <span class="text-xs" style="color: var(--la-text-tertiary)">
              {{ recordDetail.createdAt }}
            </span>
            <span class="text-xs font-mono" style="color: var(--la-text-tertiary)">
              {{ recordDetail.duration }}
            </span>
            <span class="text-xs" style="color: var(--la-text-tertiary)">
              {{ recordDetail.wordCount }} 字
            </span>
          </div>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="flex items-center gap-2">
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium"
            style="background-color: var(--la-bg-inset); color: var(--la-text-secondary)"
          >
            <MaterialIcon name="play_arrow" size="sm" />
            Play Audio
          </button>
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium"
            style="background-color: var(--la-bg-inset); color: var(--la-text-secondary)"
          >
            <MaterialIcon name="download" size="sm" />
            Export
          </button>
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium"
            style="color: var(--la-recording-red)"
          >
            <MaterialIcon name="delete" size="sm" />
            Delete
          </button>
        </div>
      </div>
    </div>

    <!-- Tabs 下划线风格 -->
    <div
      class="flex items-center gap-6 border-b"
      style="border-color: var(--la-divider)"
    >
      <button
        class="pb-2 text-sm font-medium transition-colors"
        :style="
          activeTab === 'transcript'
            ? {
                color: 'var(--la-text-primary)',
                borderBottom: '2px solid var(--la-accent)',
                marginBottom: '-1px',
              }
            : { color: 'var(--la-text-tertiary)' }
        "
        @click="activeTab = 'transcript'"
      >
        Transcript
      </button>
      <button
        class="pb-2 text-sm font-medium transition-colors"
        :style="
          activeTab === 'summary'
            ? {
                color: 'var(--la-text-primary)',
                borderBottom: '2px solid var(--la-accent)',
                marginBottom: '-1px',
              }
            : { color: 'var(--la-text-tertiary)' }
        "
        @click="activeTab = 'summary'"
      >
        Summary
      </button>
      <button
        class="pb-2 text-sm font-medium transition-colors"
        :style="
          activeTab === 'qa'
            ? {
                color: 'var(--la-text-primary)',
                borderBottom: '2px solid var(--la-accent)',
                marginBottom: '-1px',
              }
            : { color: 'var(--la-text-tertiary)' }
        "
        @click="activeTab = 'qa'"
      >
        Q&A
      </button>
    </div>

    <!-- Tab 内容 -->
    <div class="flex-1">
      <template v-if="activeTab === 'transcript'">
        <div
          class="rounded-[10px] p-6"
          style="background-color: var(--la-bg-surface)"
        >
          <pre
            class="whitespace-pre-wrap text-sm leading-relaxed"
            style="color: var(--la-text-secondary); font-family: 'Inter', sans-serif"
          >{{ recordDetail.transcript }}</pre>
        </div>
      </template>

      <template v-if="activeTab === 'summary'">
        <div
          class="flex flex-col items-center justify-center py-16 gap-3"
        >
          <MaterialIcon name="psychology" size="xl" style="color: var(--la-text-muted)" />
          <p class="text-sm" style="color: var(--la-text-tertiary)">
            点击 AI 分析生成摘要
          </p>
        </div>
      </template>

      <template v-if="activeTab === 'qa'">
        <div
          class="flex flex-col items-center justify-center py-16 gap-3"
        >
          <MaterialIcon name="forum" size="xl" style="color: var(--la-text-muted)" />
          <p class="text-sm" style="color: var(--la-text-tertiary)">
            基于转录内容进行 AI 问答
          </p>
        </div>
      </template>
    </div>
  </div>
</template>
