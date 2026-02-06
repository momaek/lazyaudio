<script setup lang="ts">
withDefaults(
  defineProps<{
    lines?: number
    showAvatar?: boolean
  }>(),
  {
    lines: 3,
    showAvatar: false,
  }
)
</script>

<template>
  <div class="space-y-4 animate-skeleton-pulse">
    <div
      v-for="i in lines"
      :key="i"
      class="flex items-start gap-3"
    >
      <!-- 头像占位 -->
      <div
        v-if="showAvatar"
        class="size-8 rounded-full shrink-0"
        style="background-color: var(--la-bg-surface)"
      />
      <!-- 内容占位 -->
      <div class="flex-1 space-y-2">
        <div
          class="h-3 rounded"
          style="background-color: var(--la-bg-surface)"
          :style="{ width: i % 2 === 0 ? '80%' : '60%' }"
        />
        <div
          v-if="i <= 2"
          class="h-3 rounded"
          style="background-color: var(--la-bg-surface); width: 40%"
        />
      </div>
    </div>
  </div>
</template>
