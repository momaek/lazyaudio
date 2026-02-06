<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <div class="min-h-screen bg-transparent">
    <!-- 悬浮窗布局 — 子窗口自行设置背景和圆角 -->
    <RouterView />
  </div>
</template>
