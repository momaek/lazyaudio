<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useModels } from '@/composables/useModels'
import { useAppStore } from '@/stores/app'
import {
  ArrowLeft,
  Download,
  Check,
  Loader2,
  Zap,
  Target,
} from 'lucide-vue-next'
import type { ModelInfo } from '@/types'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'

const router = useRouter()
const appStore = useAppStore()
const {
  models,
  isLoading,
  isDownloading,
  downloadingModelId,
  loadModels,
  downloadModel,
  setupListeners,
  getProgress,
} = useModels()

// 返回上一步
function goBack() {
  router.push('/onboarding/permission')
}

// 下载模型
async function handleDownload(modelId: string) {
  await downloadModel(modelId)
}

// 继续下一步
async function continueNext() {
  appStore.setOnboardingCompleted(true)
  const lastMode = appStore.getLastMode()
  if (lastMode) {
    router.push(`/mode/${lastMode}`)
  } else {
    router.push('/home')
  }
}

// 跳过当前步骤
function skipStep() {
  appStore.setOnboardingCompleted(true)
  router.push('/home')
}

// 获取模型特性标签
function getModelBadges(model: ModelInfo) {
  const badges = []
  if (model.modelType === 'streaming') {
    badges.push({ label: '流式', icon: Zap, color: 'bg-la-success/10 text-la-success border-la-success/20' })
  } else {
    badges.push({ label: 'Two Pass', icon: Target, color: 'bg-la-violet/10 text-la-violet border-la-violet/20' })
  }
  return badges
}

// 初始化
onMounted(async () => {
  await setupListeners()
  await loadModels()
})
</script>

<template>
  <div class="relative min-h-screen flex flex-col items-center justify-center p-6">
    <!-- 返回按钮 -->
    <Button
      variant="ghost"
      size="sm"
      class="absolute top-4 left-4 gap-2 text-muted-foreground hover:text-foreground"
      @click="goBack"
    >
      <ArrowLeft class="w-4 h-4" />
      返回
    </Button>

    <!-- 标题 -->
    <div class="text-center mb-6">
      <div class="inline-flex items-center justify-center w-12 h-12 rounded-xl la-gradient mb-3 shadow-lg shadow-la-violet/20">
        <Download class="w-6 h-6 text-white" />
      </div>
      <h1 class="text-xl font-bold mb-1">下载语音模型</h1>
      <p class="text-sm text-muted-foreground">
        选择模型开始使用
      </p>
    </div>

    <!-- 模型列表 -->
    <div class="w-full max-w-md space-y-2 mb-6">
      <div v-if="isLoading" class="text-center py-6">
        <Loader2 class="w-6 h-6 animate-spin mx-auto mb-2 text-la-indigo" />
        <p class="text-sm text-muted-foreground">加载模型列表...</p>
      </div>

      <div
        v-for="model in models"
        :key="model.id"
        class="p-4 rounded-lg border bg-card/50 border-border/50 backdrop-blur-sm transition-all duration-200"
        :class="{ 
          'border-la-success/30 bg-la-success/5': model.downloaded,
          'hover:border-border hover:bg-card/80': !model.downloaded
        }"
      >
        <!-- 标题行：名称 + Tag + 操作按钮 -->
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2 min-w-0">
            <span class="font-medium truncate">{{ model.name }}</span>
            <Badge
              v-for="badge in getModelBadges(model)"
              :key="badge.label"
              variant="outline"
              class="shrink-0 text-xs px-1.5 py-0"
              :class="badge.color"
            >
              <component :is="badge.icon" class="w-3 h-3 mr-0.5" />
              {{ badge.label }}
            </Badge>
            <Check
              v-if="model.downloaded"
              class="w-4 h-4 text-la-success shrink-0"
            />
          </div>
          
          <!-- 操作按钮 -->
          <div class="shrink-0">
            <Button
              v-if="!model.downloaded && downloadingModelId !== model.id"
              size="sm"
              variant="secondary"
              class="gap-1.5 h-7 text-xs"
              :disabled="isDownloading"
              @click="handleDownload(model.id)"
            >
              <Download class="w-3.5 h-3.5" />
              下载
            </Button>
            <Badge 
              v-else-if="model.downloaded" 
              variant="outline" 
              class="bg-la-success/10 text-la-success border-la-success/20 text-xs"
            >
              已下载
            </Badge>
          </div>
        </div>

        <!-- 描述 -->
        <p class="text-xs text-muted-foreground mt-1.5">
          {{ model.description }}
        </p>

        <!-- 下载进度 -->
        <div v-if="downloadingModelId === model.id" class="mt-3 space-y-1.5">
          <Progress :model-value="getProgress(model.id)?.overall_progress || 0" class="h-1.5" />
          <p class="text-xs text-muted-foreground">
            {{ getProgress(model.id)?.current_file || '准备下载...' }}
            {{ Math.round(getProgress(model.id)?.overall_progress || 0) }}%
          </p>
        </div>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="flex flex-col items-center gap-2">
      <Button
        class="px-6"
        :disabled="!models.some(m => m.downloaded)"
        @click="continueNext"
      >
        {{ models.some(m => m.downloaded) ? '开始使用' : '请先下载一个模型' }}
      </Button>
      
      <!-- 跳过按钮 -->
      <Button
        variant="ghost"
        size="sm"
        class="text-xs text-muted-foreground hover:text-foreground"
        @click="skipStep"
      >
        跳过，稍后下载
      </Button>
    </div>

    <!-- 提示 -->
    <p class="mt-3 text-xs text-muted-foreground text-center max-w-xs">
      跳过后语音识别功能将无法使用，可稍后在设置中下载
    </p>
  </div>
</template>
