<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { commands } from '@/types/bindings'
import { useAppEvents, EventNames } from '@/composables/useEvents'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'

const inputMethodShortcut = ref('CommandOrControl+Shift+Space')
const isInputMethodActive = ref(false)
const isInputMethodToggling = ref(false)
const { on, offAll } = useAppEvents()

const inputMethodHint = computed(() => {
  return isInputMethodActive.value
    ? '输入法模式已开启，悬浮窗将显示实时识别内容'
    : '开启后可通过全局快捷键唤起语音输入'
})

async function loadInputMethodConfig() {
  const result = await commands.getConfig()
  if (result.status === 'ok') {
    inputMethodShortcut.value = result.data.hotkeys.inputMethodToggle ?? 'CommandOrControl+Shift+Space'
  }
}

async function handleInputMethodToggle(nextValue: boolean) {
  if (isInputMethodToggling.value) return
  isInputMethodToggling.value = true
  try {
    if (nextValue) {
      await invoke('input_method_activate')
    } else {
      await invoke('input_method_cancel')
    }
    isInputMethodActive.value = nextValue
  } catch (e) {
    console.error('切换输入法模式失败:', e)
  } finally {
    isInputMethodToggling.value = false
  }
}

onMounted(async () => {
  await loadInputMethodConfig()
  await on(EventNames.INPUT_METHOD_ACTIVATED, () => {
    isInputMethodActive.value = true
  })
  await on(EventNames.INPUT_METHOD_CONFIRMED, () => {
    isInputMethodActive.value = false
  })
  await on(EventNames.INPUT_METHOD_CANCELLED, () => {
    isInputMethodActive.value = false
  })
})

onUnmounted(() => {
  offAll()
})
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-lg font-semibold mb-4">输入法模式</h2>
      <Separator class="mb-6" />
    </div>

    <Card>
      <CardHeader>
        <CardTitle class="text-base">语音输入</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="text-sm text-muted-foreground">
          {{ inputMethodHint }}
        </div>
        <div class="flex items-center gap-2 text-sm">
          <kbd class="px-2 py-1 rounded bg-muted border text-xs">
            {{ inputMethodShortcut }}
          </kbd>
          <span class="text-muted-foreground">全局快捷键</span>
        </div>
        <div class="flex items-center justify-between">
          <div class="text-sm text-muted-foreground">开启输入法模式</div>
          <Switch
            :checked="isInputMethodActive"
            :disabled="isInputMethodToggling"
            @update:checked="handleInputMethodToggle"
          />
        </div>
      </CardContent>
    </Card>
  </div>
</template>
