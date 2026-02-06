<script setup lang="ts">
import { ref, type Component } from 'vue'
import MaterialIcon from '@/components/common/MaterialIcon.vue'

import AppearanceTab from './tabs/AppearanceTab.vue'
import AudioTab from './tabs/AudioTab.vue'
import AiTab from './tabs/AiTab.vue'
import InputMethodTab from './tabs/InputMethodTab.vue'
import ShortcutsTab from './tabs/ShortcutsTab.vue'
import StorageTab from './tabs/StorageTab.vue'
import PermissionsTab from './tabs/PermissionsTab.vue'
import LanguageTab from './tabs/LanguageTab.vue'
import DeveloperTab from './tabs/DeveloperTab.vue'

// 当前选中的设置分类
const activeTab = ref('appearance')

// 设置分类定义
const settingCategories: {
  id: string
  name: string
  iconName: string
  component: Component
}[] = [
  { id: 'appearance', name: '外观', iconName: 'palette', component: AppearanceTab },
  { id: 'audio', name: '音频', iconName: 'mic', component: AudioTab },
  { id: 'ai', name: 'AI', iconName: 'psychology', component: AiTab },
  { id: 'input-method', name: '输入法', iconName: 'keyboard_voice', component: InputMethodTab },
  { id: 'shortcuts', name: '快捷键', iconName: 'keyboard', component: ShortcutsTab },
  { id: 'storage', name: '存储', iconName: 'hard_drive', component: StorageTab },
  { id: 'permissions', name: '权限', iconName: 'shield', component: PermissionsTab },
  { id: 'language', name: '语言', iconName: 'language', component: LanguageTab },
  { id: 'developer', name: '开发者', iconName: 'build', component: DeveloperTab },
]

// 当前 Tab 组件
const activeComponent = ref<Component>(AppearanceTab)

function switchTab(category: (typeof settingCategories)[number]) {
  activeTab.value = category.id
  activeComponent.value = category.component
}
</script>

<template>
  <div class="flex h-full overflow-hidden">
    <!-- 左侧导航 220px -->
    <nav
      class="w-[220px] shrink-0 p-4 flex flex-col gap-1 border-r overflow-y-auto"
      style="background-color: var(--la-bg-inset); border-color: var(--la-divider)"
    >
      <button
        v-for="category in settingCategories"
        :key="category.id"
        class="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors text-left"
        :style="
          activeTab === category.id
            ? {
                backgroundColor: 'var(--la-bg-surface)',
                color: 'var(--la-text-primary)',
              }
            : {
                color: 'var(--la-text-secondary)',
              }
        "
        @click="switchTab(category)"
      >
        <MaterialIcon :name="category.iconName" size="sm" />
        <span>{{ category.name }}</span>
      </button>
    </nav>

    <!-- 右侧内容 -->
    <div class="flex-1 overflow-y-auto p-8">
      <div class="max-w-2xl space-y-8">
        <component :is="activeComponent" />
      </div>
    </div>
  </div>
</template>
