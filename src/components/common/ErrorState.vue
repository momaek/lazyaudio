<script setup lang="ts">
import MaterialIcon from './MaterialIcon.vue'

defineProps<{
  message?: string
}>()

const emit = defineEmits<{
  retry: []
}>()
</script>

<template>
  <div
    class="rounded-lg p-3 flex items-start gap-3"
    style="background-color: color-mix(in srgb, var(--la-recording-red) 10%, transparent)"
  >
    <MaterialIcon
      name="error"
      size="sm"
      style="color: var(--la-recording-red)"
      class="mt-0.5 shrink-0"
    />
    <div class="flex-1 min-w-0">
      <p class="text-sm" style="color: var(--la-recording-red)">
        {{ message || '出现错误' }}
      </p>
      <button
        class="text-xs font-medium mt-1 underline"
        style="color: var(--la-recording-red)"
        @click="emit('retry')"
      >
        重试
      </button>
    </div>
  </div>
</template>
