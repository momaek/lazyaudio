<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useConfig } from '@/composables/useConfig'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const { hotkeyConfig } = useConfig()

// 快捷键映射（显示用）
const shortcuts = ref([
  { id: 'inputMethodToggle', label: '输入法模式切换', key: '' },
  { id: 'globalPauseResume', label: '全局暂停/继续', key: '' },
  { id: 'globalStop', label: '全局停止', key: '' },
  { id: 'addBookmark', label: '添加书签', key: '' },
])

onMounted(() => {
  if (hotkeyConfig.value) {
    const hk = hotkeyConfig.value as Record<string, string>
    shortcuts.value.forEach((s) => {
      if (hk[s.id]) {
        s.key = hk[s.id]
      }
    })
  }
})

function formatKey(key: string): string {
  if (!key) return '未设置'
  return key
    .replace('CommandOrControl', '⌘/Ctrl')
    .replace('Shift', '⇧')
    .replace('Alt', '⌥')
    .replace(/\+/g, ' + ')
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-lg font-semibold mb-4">快捷键设置</h2>
      <Separator class="mb-6" />
    </div>

    <Card>
      <CardHeader>
        <CardTitle class="text-base">全局快捷键</CardTitle>
      </CardHeader>
      <CardContent class="space-y-3">
        <div
          v-for="shortcut in shortcuts"
          :key="shortcut.id"
          class="flex items-center justify-between py-2"
        >
          <span class="text-sm">{{ shortcut.label }}</span>
          <kbd class="px-2 py-1 rounded bg-muted border text-xs font-mono">
            {{ formatKey(shortcut.key) }}
          </kbd>
        </div>
        <p class="text-xs text-muted-foreground pt-2">快捷键自定义功能开发中...</p>
      </CardContent>
    </Card>
  </div>
</template>
