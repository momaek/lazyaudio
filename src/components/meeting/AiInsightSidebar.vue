<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import MaterialIcon from '@/components/common/MaterialIcon.vue'

const props = defineProps<{
  sessionId?: string
  isOpen?: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle'): void
}>()

// Tab 状态
const activeTab = ref<'summary' | 'keypoints' | 'qa'>('summary')

// AI 生成的内容（模拟数据）
const liveContext = ref('The team is currently discussing Q3 strategy and growth metrics. Mark Chen noted a 15% increase in conversion rates...')
const actionItems = ref([
  { id: '1', text: 'Analyze Setup Wizard correlation', completed: false },
  { id: '2', text: 'Prepare full retention report', completed: false },
])
const aiSuggestion = ref('Ask Mark if the 15% lift is consistent across platforms like iOS and Web.')

// 输入框
const userInput = ref('')

function handleSubmit() {
  if (!userInput.value.trim()) return
  console.log('[AiInsightSidebar] User query:', userInput.value)
  // TODO: 调用 AI API
  userInput.value = ''
}

function toggleActionItem(id: string) {
  const item = actionItems.value.find(i => i.id === id)
  if (item) {
    item.completed = !item.completed
  }
}

// 监听全局事件
function handleToggleEvent(event: CustomEvent) {
  emit('toggle')
}

onMounted(() => {
  window.addEventListener('toggle-ai-sidebar', handleToggleEvent as EventListener)
})

onUnmounted(() => {
  window.removeEventListener('toggle-ai-sidebar', handleToggleEvent as EventListener)
})
</script>

<template>
  <aside 
    class="border-l flex flex-col h-full shrink-0 transition-all duration-300 overflow-hidden relative bg-white dark:bg-background-dark/40 dark:backdrop-blur-sm border-border-light dark:border-border-dark"
    :class="[
      isOpen ? 'w-80 opacity-100' : 'w-0 opacity-0 border-l-0'
    ]"
  >
    <!-- 顶部区域 -->
    <div class="p-6 border-b border-border-light dark:border-border-dark bg-gray-50/50 dark:bg-surface-dark/30">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2">
          <MaterialIcon name="temp_preferences_custom" class="text-brand-primary dark:text-primary-bright" size="lg" />
          <h3 class="text-lg font-bold text-text-main dark:text-white font-display">AI Insight</h3>
        </div>
        <button
          class="size-8 flex items-center justify-center rounded-lg transition-colors hover:bg-gray-200 dark:hover:bg-white/5 text-text-muted dark:text-text-muted-dark hover:text-text-main dark:hover:text-white"
          title="Collapse Sidebar"
          @click="emit('toggle')"
        >
          <MaterialIcon name="keyboard_double_arrow_right" size="md" />
        </button>
      </div>

      <!-- Tab 切换 -->
      <div class="flex p-1 bg-white dark:bg-surface-dark rounded-lg border border-border-light dark:border-border-dark shadow-sm">
        <button
          class="flex-1 py-1.5 text-[11px] font-bold rounded-md uppercase tracking-wider transition-colors font-display"
          :class="[
            activeTab === 'summary'
              ? 'bg-brand-primary dark:bg-border-dark text-white'
              : 'text-text-muted dark:text-text-muted-dark hover:text-text-main dark:hover:text-white hover:bg-gray-50 dark:hover:bg-white/5'
          ]"
          @click="activeTab = 'summary'"
        >
          Summary
        </button>
        <button
          class="flex-1 py-1.5 text-[11px] font-bold rounded-md uppercase tracking-wider transition-colors font-display"
          :class="[
            activeTab === 'keypoints'
              ? 'bg-brand-primary dark:bg-border-dark text-white'
              : 'text-text-muted dark:text-text-muted-dark hover:text-text-main dark:hover:text-white hover:bg-gray-50 dark:hover:bg-white/5'
          ]"
          @click="activeTab = 'keypoints'"
        >
          Key Points
        </button>
        <button
          class="flex-1 py-1.5 text-[11px] font-bold rounded-md uppercase tracking-wider transition-colors font-display"
          :class="[
            activeTab === 'qa'
              ? 'bg-brand-primary dark:bg-border-dark text-white'
              : 'text-text-muted dark:text-text-muted-dark hover:text-text-main dark:hover:text-white hover:bg-gray-50 dark:hover:bg-white/5'
          ]"
          @click="activeTab = 'qa'"
        >
          Q&A
        </button>
      </div>
    </div>

    <!-- 内容区 -->
    <div class="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-6">
      <!-- Summary Tab -->
      <template v-if="activeTab === 'summary'">
        <!-- Live Context -->
        <section>
          <h4 class="text-[10px] uppercase font-bold text-brand-primary dark:text-primary-bright tracking-widest mb-3 font-display">
            Live Context
          </h4>
          <div class="text-sm leading-relaxed bg-white dark:bg-surface-dark p-4 rounded-xl border border-border-light dark:border-border-dark shadow-sm text-gray-700 dark:text-text-muted-dark">
            The team is currently discussing <b class="text-brand-primary dark:text-primary-bright">Q3 strategy</b> and growth metrics. 
            Mark Chen noted a <b class="text-brand-primary dark:text-primary-bright">15% increase</b> in conversion rates, 
            while Sarah Jenkins is shifting the focus toward <b class="text-brand-primary dark:text-primary-bright">Day 7 retention</b>.
          </div>
        </section>

        <!-- Action Items -->
        <section>
          <h4 class="text-[10px] uppercase font-bold text-brand-primary dark:text-primary-bright tracking-widest mb-3 font-display">
            Action Items
          </h4>
          <div class="bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl overflow-hidden shadow-sm">
            <div class="p-4 space-y-4">
              <div
                v-for="item in actionItems"
                :key="item.id"
                class="flex gap-3 text-sm text-text-main dark:text-white group cursor-pointer items-start"
                @click="toggleActionItem(item.id)"
              >
                <MaterialIcon 
                  :name="item.completed ? 'check_box' : 'check_box_outline_blank'" 
                  size="lg"
                  class="shrink-0 transition-colors"
                  :class="[
                    item.completed 
                      ? 'text-brand-primary dark:text-primary-bright' 
                      : 'text-brand-primary dark:text-primary-bright opacity-40 group-hover:opacity-100'
                  ]"
                />
                <span 
                  class="pt-0.5 transition-all"
                  :class="[
                    item.completed ? 'line-through opacity-50' : 'group-hover:text-brand-primary dark:group-hover:text-primary-bright'
                  ]"
                >
                  {{ item.text }}
                </span>
              </div>
            </div>
          </div>
        </section>

        <!-- AI Suggestion -->
        <div class="bg-brand-primary/5 dark:bg-primary-bright/5 rounded-xl p-4 border border-brand-primary/20 dark:border-primary-bright/20">
          <div class="flex items-center gap-2 mb-2">
            <MaterialIcon name="lightbulb" size="sm" class="text-brand-primary dark:text-primary-bright" />
            <span class="text-xs font-bold text-brand-primary dark:text-primary-bright font-display">AI Suggestion</span>
          </div>
          <p class="text-xs text-text-muted dark:text-text-muted-dark italic leading-relaxed">
            "{{ aiSuggestion }}"
          </p>
        </div>
      </template>

      <!-- Key Points Tab -->
      <template v-if="activeTab === 'keypoints'">
        <div class="text-sm text-text-muted dark:text-text-muted-dark text-center py-8">
          Key points will appear here...
        </div>
      </template>

      <!-- Q&A Tab -->
      <template v-if="activeTab === 'qa'">
        <div class="text-sm text-text-muted dark:text-text-muted-dark text-center py-8">
          Q&A history will appear here...
        </div>
      </template>
    </div>

    <!-- 底部输入区 -->
    <div class="p-4 border-t border-border-light dark:border-border-dark bg-gray-50/80 dark:bg-surface-dark/30">
      <div class="relative">
        <input
          v-model="userInput"
          type="text"
          class="w-full bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg py-2.5 pl-4 pr-10 text-sm focus:ring-1 focus:ring-brand-primary dark:focus:ring-primary-bright focus:border-brand-primary dark:focus:border-primary-bright text-text-main dark:text-white placeholder:text-gray-400 dark:placeholder:text-text-muted-dark shadow-sm transition-all"
          placeholder="Ask AI anything..."
          @keydown.enter="handleSubmit"
        />
        <button
          class="absolute right-2 top-1/2 -translate-y-1/2 text-brand-primary dark:text-primary-bright transition-all hover:scale-110"
          @click="handleSubmit"
        >
          <MaterialIcon name="send" size="lg" />
        </button>
      </div>
    </div>
  </aside>
</template>
