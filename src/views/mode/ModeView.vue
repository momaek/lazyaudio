<script setup lang="ts">
import { computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { modeRegistry } from '@/modes/registry'
import { useModeStore } from '@/stores/mode'
import MaterialIcon from '@/components/common/MaterialIcon.vue'

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
    class="flex flex-col items-center justify-center min-h-[60vh]"
  >
    <MaterialIcon name="error" size="xl" style="color: var(--la-text-muted)" class="mb-4" />
    <h2 class="text-lg font-medium mb-2" style="color: var(--la-text-primary)">模式不存在</h2>
    <p class="text-sm" style="color: var(--la-text-tertiary)">
      未找到模式 "{{ modeId }}"
    </p>
    <RouterLink
      to="/home"
      class="mt-4 text-sm font-medium"
      style="color: var(--la-accent)"
    >
      返回首页
    </RouterLink>
  </div>
</template>
