<script setup lang="ts">
import MaterialIcon from './MaterialIcon.vue'

withDefaults(
  defineProps<{
    icon?: string
    title?: string
    description?: string
  }>(),
  {
    icon: 'inbox',
    title: 'Nothing here yet',
    description: '',
  }
)
</script>

<template>
  <div class="flex flex-col items-center justify-center py-16 gap-3 text-center">
    <MaterialIcon
      :name="icon"
      size="xl"
      style="color: var(--la-text-muted)"
    />
    <p class="text-sm font-medium" style="color: var(--la-text-secondary)">
      {{ title }}
    </p>
    <p v-if="description" class="text-xs" style="color: var(--la-text-tertiary)">
      {{ description }}
    </p>
    <slot />
  </div>
</template>
