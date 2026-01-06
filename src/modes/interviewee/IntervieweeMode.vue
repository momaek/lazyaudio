<script setup lang="ts">
import { ref } from 'vue'
import { User, ExternalLink, Settings2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'

// 悬浮窗是否已打开
const isFloatingOpen = ref(false)

// 设置
const settings = ref({
  autoListen: true,
  showSuggestions: true,
  lowLatencyMode: false,
})

function openFloatingWindow() {
  // TODO: 调用 Tauri 打开悬浮窗
  isFloatingOpen.value = true
  console.log('打开悬浮窗')
}

function closeFloatingWindow() {
  isFloatingOpen.value = false
  console.log('关闭悬浮窗')
}
</script>

<template>
  <div class="container mx-auto px-4 py-8 max-w-2xl">
    <!-- 标题区 -->
    <div class="text-center mb-8">
      <div class="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-la-warning to-orange-500 mb-4 shadow-lg shadow-la-warning/20">
        <User class="w-10 h-10 text-white" />
      </div>
      <h1 class="text-2xl font-bold mb-2">面试者模式</h1>
      <p class="text-muted-foreground">
        实时转录面试问题，AI 提供回答建议
      </p>
    </div>

    <!-- 悬浮窗控制 -->
    <Card class="mb-6 bg-card/50 border-border/50">
      <CardHeader>
        <CardTitle class="text-lg">悬浮窗</CardTitle>
        <CardDescription>
          悬浮窗将显示在屏幕边缘，实时展示转录和建议
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div class="flex items-center justify-between">
          <div>
            <p class="font-medium">
              {{ isFloatingOpen ? '悬浮窗已打开' : '悬浮窗已关闭' }}
            </p>
            <p class="text-sm text-muted-foreground">
              {{ isFloatingOpen ? '点击关闭按钮或使用快捷键关闭' : '点击打开悬浮窗开始使用' }}
            </p>
          </div>
          <Button
            v-if="!isFloatingOpen"
            class="gap-2"
            @click="openFloatingWindow"
          >
            <ExternalLink class="h-4 w-4" />
            打开悬浮窗
          </Button>
          <Button
            v-else
            variant="outline"
            @click="closeFloatingWindow"
          >
            关闭悬浮窗
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- 设置区 -->
    <Card class="bg-card/50 border-border/50">
      <CardHeader>
        <CardTitle class="text-lg flex items-center gap-2">
          <Settings2 class="h-5 w-5 text-muted-foreground" />
          模式设置
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <!-- 自动监听 -->
        <div class="flex items-center justify-between">
          <div>
            <p class="font-medium">自动开始监听</p>
            <p class="text-sm text-muted-foreground">打开悬浮窗时自动开始转录</p>
          </div>
          <Switch v-model:checked="settings.autoListen" />
        </div>

        <!-- 显示建议 -->
        <div class="flex items-center justify-between">
          <div>
            <p class="font-medium">显示 AI 建议</p>
            <p class="text-sm text-muted-foreground">在悬浮窗中显示回答建议</p>
          </div>
          <Switch v-model:checked="settings.showSuggestions" />
        </div>

        <!-- 低延迟模式 -->
        <div class="flex items-center justify-between">
          <div>
            <p class="font-medium">低延迟模式</p>
            <p class="text-sm text-muted-foreground">牺牲部分准确性提高响应速度</p>
          </div>
          <Switch v-model:checked="settings.lowLatencyMode" />
        </div>
      </CardContent>
    </Card>

    <!-- 提示 -->
    <div class="mt-6 text-center text-sm text-muted-foreground">
      <p>提示：使用 <kbd class="px-1.5 py-0.5 bg-secondary rounded text-xs">⌘ + Shift + L</kbd> 快捷键快速开关悬浮窗</p>
    </div>
  </div>
</template>
