<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { Toaster } from '@/components/ui/toast'
import { useAsrFallbackNotification } from '@/composables/useAsrProvider'

// 全局监听 ASR 降级事件
const { startListening: startFallbackListener } = useAsrFallbackNotification()

onMounted(() => {
  startFallbackListener()
})
</script>

<template>
  <RouterView />
  <Toaster />
</template>
