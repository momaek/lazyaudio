<script setup lang="ts">
import { ref, watch } from 'vue'
import MaterialIcon from './MaterialIcon.vue'

const props = withDefaults(
  defineProps<{
    show: boolean
    type?: 'info' | 'success' | 'error' | 'warning'
    message: string
    duration?: number
  }>(),
  {
    type: 'info',
    duration: 4000,
  }
)

const emit = defineEmits<{
  close: []
}>()

const isVisible = ref(false)

const typeConfig = {
  info: { icon: 'info', borderColor: 'var(--la-accent)' },
  success: { icon: 'check_circle', borderColor: 'var(--la-tier2-green)' },
  error: { icon: 'error', borderColor: 'var(--la-recording-red)' },
  warning: { icon: 'warning', borderColor: 'var(--la-accent)' },
}

watch(
  () => props.show,
  (val) => {
    isVisible.value = val
    if (val && props.duration > 0) {
      setTimeout(() => {
        emit('close')
      }, props.duration)
    }
  }
)
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-200 ease-out"
    enter-from-class="opacity-0 translate-x-4"
    enter-to-class="opacity-100 translate-x-0"
    leave-active-class="transition-all duration-150 ease-in"
    leave-from-class="opacity-100 translate-x-0"
    leave-to-class="opacity-0 translate-x-4"
  >
    <div
      v-if="show"
      class="fixed top-4 right-4 z-[9999] flex items-center gap-3 px-4 py-3 rounded-[10px] border max-w-sm"
      :style="{
        backgroundColor: 'var(--la-bg-surface)',
        borderColor: typeConfig[type].borderColor,
      }"
    >
      <MaterialIcon
        :name="typeConfig[type].icon"
        size="sm"
        :style="{ color: typeConfig[type].borderColor }"
      />
      <p class="text-sm flex-1" style="color: var(--la-text-primary)">
        {{ message }}
      </p>
      <button
        class="size-5 flex items-center justify-center shrink-0"
        style="color: var(--la-text-muted)"
        @click="emit('close')"
      >
        <MaterialIcon name="close" size="sm" />
      </button>
    </div>
  </Transition>
</template>
