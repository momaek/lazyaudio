<script setup lang="ts">
import { RouterView } from 'vue-router'
import { onMounted } from 'vue'
import AppHeader from '@/components/common/AppHeader.vue'

// 确保深色模式（默认）
onMounted(() => {
  // 可以根据用户设置或系统偏好来决定
  // 这里默认使用深色模式
  document.documentElement.classList.add('dark')
  
  // 也可以根据系统偏好：
  // const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  // if (prefersDark) {
  //   document.documentElement.classList.add('dark')
  // }
})
</script>

<template>
  <div class="min-h-screen bg-background-light dark:bg-background-dark text-text-main dark:text-white flex flex-col font-body">
    <!-- 顶栏 -->
    <AppHeader />
    
    <!-- 主内容区 -->
    <main class="flex-1 overflow-auto">
      <RouterView />
    </main>
  </div>
</template>
