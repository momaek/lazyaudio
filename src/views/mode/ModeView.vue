<script setup lang="ts">
import { computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { modeRegistry } from '@/modes/registry'
import { useModeStore } from '@/stores/mode'
import { AlertCircle } from 'lucide-vue-next'

const route = useRoute()
const modeStore = useModeStore()

// 从路由获取 mode ID
const modeId = computed(() => route.params.modeId as string)

// 获取 mode 定义
const modeDefinition = computed(() => {
  if (!modeId.value) return null
  return modeRegistry.get(modeId.value)
})

// 同步 mode store 状态
watch(
  modeId,
  async (newModeId) => {
    if (newModeId && modeStore.currentPrimaryModeId !== newModeId) {
      await modeStore.switchPrimaryMode(newModeId)
    }
  },
  { immediate: true }
)

onMounted(async () => {
  if (modeId.value && modeStore.currentPrimaryModeId !== modeId.value) {
    await modeStore.switchPrimaryMode(modeId.value)
  }
})
</script>

<template>
  <!-- 动态加载 Mode 组件 -->
  <component
    v-if="modeDefinition"
    :is="modeDefinition.component"
    :key="modeId"
  />

  <!-- Mode 不存在时显示错误 -->
  <div
    v-else
    class="flex flex-col items-center justify-center min-h-[60vh] text-muted-foreground"
  >
    <AlertCircle class="w-12 h-12 mb-4 text-amber-500" />
    <h2 class="text-xl font-medium mb-2">模式不存在</h2>
    <p class="text-sm">
      未找到模式 "{{ modeId }}"
    </p>
    <RouterLink
      to="/home"
      class="mt-4 text-primary hover:underline"
    >
      返回首页
    </RouterLink>
  </div>
</template>

