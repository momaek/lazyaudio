<template>
  <span 
    class="material-symbols-rounded"
    :class="[sizeClass, fillClass, className]"
    :style="{ fontVariationSettings: variationSettings }"
  >
    {{ name }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  name: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  fill?: boolean
  weight?: number
  className?: string
}>(), {
  size: 'md',
  fill: false,
  weight: 400,
  className: ''
})

// 尺寸映射
const sizeClass = computed(() => {
  const sizes = {
    sm: 'text-[18px]',
    md: 'text-[20px]',
    lg: 'text-2xl',      // 24px
    xl: 'text-5xl',      // 48px
    '2xl': 'text-[128px]'
  }
  return sizes[props.size]
})

const fillClass = computed(() => props.fill ? 'fill-1' : 'fill-0')

const variationSettings = computed(() => {
  const weight = props.weight
  const fill = props.fill ? 1 : 0
  return `'FILL' ${fill}, 'wght' ${weight}, 'GRAD' 0, 'opsz' 24`
})
</script>
