<script setup lang="ts">
import { RouterView } from 'vue-router'
import { onMounted } from 'vue'
import AppHeader from '@/components/common/AppHeader.vue'

// 确保深色模式
onMounted(() => {
  document.documentElement.classList.add('dark')
})
</script>

<template>
  <div class="min-h-screen bg-background text-foreground flex flex-col">
    <!-- 顶栏 -->
    <AppHeader />
    
    <!-- 主内容区 -->
    <main class="flex-1 overflow-auto">
      <RouterView />
    </main>
  </div>
</template>
