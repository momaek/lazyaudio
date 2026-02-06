<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useModeStore } from '@/stores/mode'
import { useAppStore } from '@/stores/app'
import MaterialIcon from '@/components/common/MaterialIcon.vue'

const router = useRouter()
const modeStore = useModeStore()
const appStore = useAppStore()

// Mode 卡片配置
const modeCards = [
  {
    id: 'meeting',
    name: '会议模式',
    description: '记录会议内容，自动生成摘要和待办事项',
    iconName: 'edit_note',
  },
  {
    id: 'interviewer',
    name: '面试官模式',
    description: '记录面试过程，追踪问题和评价候选人',
    iconName: 'record_voice_over',
  },
  {
    id: 'interviewee',
    name: '面试者模式',
    description: '实时转录面试问题，AI 提供回答建议',
    iconName: 'person',
  },
]

// 当前选中模式
const selectedModeId = computed(() => modeStore.currentPrimaryModeId)

// 选择模式
async function selectMode(modeId: string) {
  const success = await modeStore.switchPrimaryMode(modeId)
  if (success) {
    appStore.setLastMode(modeId)
    router.push(`/mode/${modeId}`)
  }
}

// Input Method overlay 状态（TODO: 从 modeStore 获取真实值）
const isInputMethodEnabled = computed(() => false)
function toggleInputMethod() {
  // TODO: 实现 overlay mode 切换
}
</script>

<template>
  <div class="flex-1 flex flex-col items-center justify-center p-8">
    <div class="w-full max-w-[720px] flex flex-col gap-8">
      <!-- 欢迎标题 -->
      <div class="text-center">
        <h1 class="text-2xl font-bold mb-2" style="color: var(--la-text-primary)">
          选择一个模式开始
        </h1>
        <p class="text-sm" style="color: var(--la-text-secondary)">
          每个模式针对不同使用场景优化
        </p>
      </div>

      <!-- 模式选择卡片 — 三列等宽 -->
      <div class="grid grid-cols-3 gap-4">
        <button
          v-for="mode in modeCards"
          :key="mode.id"
          class="flex flex-col items-center gap-4 p-6 rounded-xl text-center transition-colors"
          :style="
            selectedModeId === mode.id
              ? {
                  backgroundColor: 'var(--la-bg-surface)',
                  border: '2px solid var(--la-accent)',
                }
              : {
                  backgroundColor: 'var(--la-bg-surface)',
                  border: '1px solid transparent',
                }
          "
          @click="selectMode(mode.id)"
        >
          <!-- 图标容器 -->
          <div
            class="size-12 rounded-[10px] flex items-center justify-center"
            style="background-color: var(--la-bg-inset); color: var(--la-text-secondary)"
          >
            <MaterialIcon :name="mode.iconName" size="lg" />
          </div>

          <!-- 文字 -->
          <div>
            <h3 class="text-sm font-semibold mb-1" style="color: var(--la-text-primary)">
              {{ mode.name }}
            </h3>
            <p class="text-xs leading-relaxed" style="color: var(--la-text-tertiary)">
              {{ mode.description }}
            </p>
          </div>
        </button>
      </div>

      <!-- Input Method Toggle 区域 -->
      <div
        class="flex items-center justify-between p-4 rounded-xl"
        style="background-color: var(--la-bg-surface)"
      >
        <div class="flex items-center gap-3">
          <MaterialIcon name="keyboard" size="md" style="color: var(--la-text-secondary)" />
          <div>
            <p class="text-sm font-medium" style="color: var(--la-text-primary)">
              输入法模式
            </p>
            <p class="text-xs" style="color: var(--la-text-tertiary)">
              语音输入到任意应用，可与其他模式同时使用
            </p>
          </div>
        </div>
        <!-- Toggle 开关 -->
        <button
          class="relative w-10 h-[22px] rounded-full transition-colors"
          :style="
            isInputMethodEnabled
              ? { backgroundColor: 'var(--la-accent)' }
              : { backgroundColor: 'var(--la-border)' }
          "
          @click="toggleInputMethod"
        >
          <span
            class="absolute top-[2px] size-[18px] rounded-full transition-transform"
            :style="{
              backgroundColor: 'var(--la-text-primary)',
              transform: isInputMethodEnabled ? 'translateX(20px)' : 'translateX(2px)',
            }"
          />
        </button>
      </div>

      <!-- 快速继续 -->
      <div v-if="modeStore.currentPrimaryModeId" class="text-center">
        <button
          class="inline-flex items-center gap-2 px-5 py-2 rounded-md text-sm font-medium transition-colors"
          style="
            background-color: var(--la-bg-surface);
            color: var(--la-text-secondary);
          "
          @click="router.push(`/mode/${modeStore.currentPrimaryModeId}`)"
        >
          继续上次的模式
          <MaterialIcon name="arrow_forward" size="sm" />
        </button>
      </div>
    </div>
  </div>
</template>
