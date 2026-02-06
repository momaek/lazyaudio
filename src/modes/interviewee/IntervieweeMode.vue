<script setup lang="ts">
import { ref } from 'vue'
import MaterialIcon from '@/components/common/MaterialIcon.vue'
import SectionLabel from '@/components/common/SectionLabel.vue'
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
  isFloatingOpen.value = true
  console.log('打开悬浮窗')
}

function closeFloatingWindow() {
  isFloatingOpen.value = false
  console.log('关闭悬浮窗')
}
</script>

<template>
  <div class="flex flex-col items-center p-8 gap-8 overflow-y-auto h-full">
    <div class="w-full max-w-lg flex flex-col gap-6">
      <!-- 标题区 -->
      <div class="text-center">
        <div
          class="inline-flex items-center justify-center size-16 rounded-2xl mb-4"
          style="background-color: var(--la-accent-dim)"
        >
          <MaterialIcon name="person" size="xl" style="color: var(--la-text-inverted)" />
        </div>
        <h1 class="text-xl font-bold mb-2" style="color: var(--la-text-primary)">
          面试者模式
        </h1>
        <p class="text-sm" style="color: var(--la-text-secondary)">
          实时转录面试问题，AI 提供回答建议
        </p>
      </div>

      <!-- 悬浮窗控制 -->
      <div class="rounded-[10px] p-5" style="background-color: var(--la-bg-surface)">
        <SectionLabel label="Floating Window" class="mb-4 block" />
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium" style="color: var(--la-text-primary)">
              {{ isFloatingOpen ? '悬浮窗已打开' : '悬浮窗已关闭' }}
            </p>
            <p class="text-xs" style="color: var(--la-text-tertiary)">
              {{ isFloatingOpen ? '点击关闭' : '点击打开悬浮窗开始使用' }}
            </p>
          </div>
          <button
            v-if="!isFloatingOpen"
            class="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium"
            style="background-color: var(--la-accent); color: var(--la-text-inverted)"
            @click="openFloatingWindow"
          >
            <MaterialIcon name="open_in_new" size="sm" />
            打开悬浮窗
          </button>
          <button
            v-else
            class="px-4 py-2 rounded-md text-sm font-medium"
            style="background-color: var(--la-bg-inset); color: var(--la-text-secondary)"
            @click="closeFloatingWindow"
          >
            关闭悬浮窗
          </button>
        </div>
      </div>

      <!-- 设置区 -->
      <div class="rounded-[10px] p-5" style="background-color: var(--la-bg-surface)">
        <SectionLabel label="Settings" class="mb-4 block" />
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium" style="color: var(--la-text-primary)">自动开始监听</p>
              <p class="text-xs" style="color: var(--la-text-tertiary)">打开悬浮窗时自动转录</p>
            </div>
            <Switch v-model:checked="settings.autoListen" />
          </div>

          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium" style="color: var(--la-text-primary)">显示 AI 建议</p>
              <p class="text-xs" style="color: var(--la-text-tertiary)">在悬浮窗中显示回答建议</p>
            </div>
            <Switch v-model:checked="settings.showSuggestions" />
          </div>

          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium" style="color: var(--la-text-primary)">低延迟模式</p>
              <p class="text-xs" style="color: var(--la-text-tertiary)">牺牲部分准确性提高响应速度</p>
            </div>
            <Switch v-model:checked="settings.lowLatencyMode" />
          </div>
        </div>
      </div>

      <!-- 提示 -->
      <div class="text-center">
        <p class="text-xs" style="color: var(--la-text-tertiary)">
          使用
          <kbd
            class="px-1.5 py-0.5 rounded text-[10px]"
            style="background-color: var(--la-bg-surface)"
          >
            ⌘ + Shift + L
          </kbd>
          快捷键快速开关悬浮窗
        </p>
      </div>
    </div>
  </div>
</template>
