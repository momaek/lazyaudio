<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppHeader from '@/components/common/AppHeader.vue'
</script>

<template>
  <div class="h-screen flex flex-col overflow-hidden bg-la-bg-primary text-la-text-primary">
    <!-- 顶栏 -->
    <AppHeader />

    <!-- 主内容区 -->
    <main class="flex-1 min-h-0 relative">
      <RouterView v-slot="{ Component }">
        <component :is="Component" class="absolute inset-0" />
      </RouterView>
    </main>
  </div>
</template>
