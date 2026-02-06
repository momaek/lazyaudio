<script setup lang="ts">
import { useConfig } from '@/composables/useConfig'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const { language, setLanguage } = useConfig()

const languageOptions = [
  { value: 'zh-cn', label: '简体中文' },
  { value: 'en-us', label: 'English' },
]
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-lg font-semibold mb-4">语言设置</h2>
      <Separator class="mb-6" />
    </div>

    <div class="flex items-center justify-between">
      <div>
        <h3 class="font-medium">界面语言</h3>
        <p class="text-sm text-muted-foreground">选择应用的显示语言</p>
      </div>
      <Select :model-value="language" @update:model-value="(v: any) => setLanguage(v)">
        <SelectTrigger class="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="option in languageOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <p class="text-xs text-muted-foreground">更改语言后需要重启应用以生效。</p>
  </div>
</template>
