<script setup lang="ts">
defineProps<{
  label: string
}>()
</script>

<template>
  <span class="section-label">{{ label }}</span>
</template>

<style scoped>
.section-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: var(--la-text-tertiary);
  font-family: 'Inter', sans-serif;
  user-select: none;
}
</style>
