<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppHeader from '@/components/common/AppHeader.vue'
</script>

<template>
  <div class="min-h-screen flex flex-col bg-la-bg-primary text-la-text-primary">
    <!-- 顶栏 -->
    <AppHeader />

    <!-- 主内容区 -->
    <main class="flex-1 overflow-auto">
      <RouterView v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>
  </div>
</template>

<style scoped>
.page-enter-active {
  transition: opacity 0.2s ease-out, transform 0.2s ease-out;
}
.page-leave-active {
  transition: opacity 0.15s ease-in, transform 0.15s ease-in;
}
.page-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.page-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
