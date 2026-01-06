<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import {
  ArrowLeft,
  Palette,
  Globe,
  Mic,
  Bot,
  Keyboard,
  HardDrive,
  Shield,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const router = useRouter()
const appStore = useAppStore()

// 当前选中的设置分类
const activeTab = ref('appearance')

// 设置分类
const settingCategories = [
  { id: 'appearance', name: '外观', icon: Palette },
  { id: 'audio', name: '音频', icon: Mic },
  { id: 'ai', name: 'AI', icon: Bot },
  { id: 'shortcuts', name: '快捷键', icon: Keyboard },
  { id: 'storage', name: '存储', icon: HardDrive },
  { id: 'permissions', name: '权限', icon: Shield },
  { id: 'language', name: '语言', icon: Globe },
]

// 主题选项
const themeOptions = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
]

// 返回
function goBack() {
  router.back()
}
</script>

<template>
  <div class="container mx-auto px-4 py-6 max-w-4xl">
    <!-- 标题栏 -->
    <div class="flex items-center gap-4 mb-6">
      <Button variant="ghost" size="icon" class="text-muted-foreground" @click="goBack">
        <ArrowLeft class="h-5 w-5" />
      </Button>
      <h1 class="text-2xl font-bold">设置</h1>
    </div>

    <!-- 设置内容 -->
    <Tabs v-model="activeTab" class="flex gap-6">
      <!-- 左侧分类列表 -->
      <TabsList class="flex flex-col h-auto bg-transparent justify-start gap-1 w-48 shrink-0">
        <TabsTrigger
          v-for="category in settingCategories"
          :key="category.id"
          :value="category.id"
          class="justify-start gap-3 px-3 w-full data-[state=active]:bg-accent"
        >
          <component :is="category.icon" class="h-4 w-4" />
          {{ category.name }}
        </TabsTrigger>
      </TabsList>

      <!-- 右侧设置内容 -->
      <div class="flex-1 min-w-0">
        <!-- 外观设置 -->
        <TabsContent value="appearance" class="mt-0">
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
        </TabsContent>

        <!-- 音频设置 -->
        <TabsContent value="audio" class="mt-0">
          <div class="space-y-6">
            <div>
              <h2 class="text-lg font-semibold mb-4">音频设置</h2>
              <Separator class="mb-6" />
            </div>
            <p class="text-muted-foreground">音频设置功能开发中...</p>
          </div>
        </TabsContent>

        <!-- AI 设置 -->
        <TabsContent value="ai" class="mt-0">
          <div class="space-y-6">
            <div>
              <h2 class="text-lg font-semibold mb-4">AI 设置</h2>
              <Separator class="mb-6" />
            </div>
            <p class="text-muted-foreground">AI 设置功能开发中...</p>
          </div>
        </TabsContent>

        <!-- 快捷键设置 -->
        <TabsContent value="shortcuts" class="mt-0">
          <div class="space-y-6">
            <div>
              <h2 class="text-lg font-semibold mb-4">快捷键设置</h2>
              <Separator class="mb-6" />
            </div>
            <p class="text-muted-foreground">快捷键设置功能开发中...</p>
          </div>
        </TabsContent>

        <!-- 存储设置 -->
        <TabsContent value="storage" class="mt-0">
          <div class="space-y-6">
            <div>
              <h2 class="text-lg font-semibold mb-4">存储设置</h2>
              <Separator class="mb-6" />
            </div>
            <p class="text-muted-foreground">存储设置功能开发中...</p>
          </div>
        </TabsContent>

        <!-- 权限设置 -->
        <TabsContent value="permissions" class="mt-0">
          <div class="space-y-6">
            <div>
              <h2 class="text-lg font-semibold mb-4">权限设置</h2>
              <Separator class="mb-6" />
            </div>
            <p class="text-muted-foreground">权限设置功能开发中...</p>
          </div>
        </TabsContent>

        <!-- 语言设置 -->
        <TabsContent value="language" class="mt-0">
          <div class="space-y-6">
            <div>
              <h2 class="text-lg font-semibold mb-4">语言设置</h2>
              <Separator class="mb-6" />
            </div>
            <p class="text-muted-foreground">语言设置功能开发中...</p>
          </div>
        </TabsContent>
      </div>
    </Tabs>
  </div>
</template>
