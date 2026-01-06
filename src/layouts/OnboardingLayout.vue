<script setup lang="ts">
import { RouterView } from 'vue-router'
import { onMounted } from 'vue'

// 确保深色模式
onMounted(() => {
  document.documentElement.classList.add('dark')
})
</script>

<template>
  <div class="min-h-screen bg-background text-foreground flex flex-col">
    <!-- 背景装饰 -->
    <div class="fixed inset-0 overflow-hidden pointer-events-none">
      <!-- 渐变光晕 -->
      <div class="absolute top-0 left-1/4 w-96 h-96 bg-la-indigo/10 rounded-full blur-3xl" />
      <div class="absolute bottom-0 right-1/4 w-96 h-96 bg-la-violet/10 rounded-full blur-3xl" />
    </div>
    
    <!-- 引导流程内容 -->
    <RouterView />
  </div>
</template>
