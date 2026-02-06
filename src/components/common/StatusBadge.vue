<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    status: 'completed' | 'in_progress' | 'error' | 'recording' | 'paused'
    label?: string
  }>(),
  {
    label: '',
  }
)

const statusConfig = computed(() => {
  const configs = {
    completed: {
      color: 'var(--la-tier2-green)',
      defaultLabel: 'Completed',
    },
    in_progress: {
      color: 'var(--la-accent)',
      defaultLabel: 'In Progress',
    },
    error: {
      color: 'var(--la-recording-red)',
      defaultLabel: 'Error',
    },
    recording: {
      color: 'var(--la-recording-red)',
      defaultLabel: 'Recording',
    },
    paused: {
      color: 'var(--la-text-tertiary)',
      defaultLabel: 'Paused',
    },
  }
  return configs[props.status]
})

const displayLabel = computed(() => props.label || statusConfig.value.defaultLabel)
</script>

<template>
  <span
    class="status-badge"
    :style="{
      borderColor: statusConfig.color,
      color: statusConfig.color,
    }"
  >
    {{ displayLabel }}
  </span>
</template>

<style scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  border: 1px solid;
  border-radius: 6px;
  padding: 2px 10px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  user-select: none;
}
</style>
