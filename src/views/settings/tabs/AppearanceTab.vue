<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const appStore = useAppStore()

const themeOptions = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
]
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-lg font-semibold mb-4">外观设置</h2>
      <Separator class="mb-6" />
    </div>

    <!-- 主题 -->
    <div class="flex items-center justify-between">
      <div>
        <h3 class="font-medium">主题</h3>
        <p class="text-sm text-muted-foreground">选择应用的颜色主题</p>
      </div>
      <Select
        :model-value="appStore.currentTheme"
        @update:model-value="(v: any) => appStore.setTheme(v)"
      >
        <SelectTrigger class="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="option in themeOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  </div>
</template>
