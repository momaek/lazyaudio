<script setup lang="ts">
import { computed } from 'vue'
import { useConfig } from '@/composables/useConfig'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'

const { storageConfig, saveAudioByDefault, updateConfig } = useConfig()

const basePath = computed(() => storageConfig.value?.basePath ?? '~/.lazyaudio')
const cleanupAfterDays = computed(() => storageConfig.value?.cleanupAfterDays ?? 90)

async function toggleSaveAudio(val: boolean) {
  await updateConfig({
    storage: { ...storageConfig.value, saveAudioByDefault: val } as any,
  })
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-lg font-semibold mb-4">存储设置</h2>
      <Separator class="mb-6" />
    </div>

    <Card>
      <CardHeader>
        <CardTitle class="text-base">数据存储</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-sm font-medium">数据目录</h3>
            <p class="text-xs text-muted-foreground mt-1">{{ basePath }}</p>
          </div>
        </div>

        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-sm font-medium">默认保存录音</h3>
            <p class="text-xs text-muted-foreground mt-1">录制结束后自动保存音频文件</p>
          </div>
          <Switch :checked="saveAudioByDefault" @update:checked="toggleSaveAudio" />
        </div>

        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-sm font-medium">历史保留天数</h3>
            <p class="text-xs text-muted-foreground mt-1">超过 {{ cleanupAfterDays }} 天的记录将被自动清理</p>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
