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
  HardDrive,
  Zap,
  Scale,
  Target,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
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
function getModelBadges(model: any) {
  const badges = []
  if (model.id.includes('small') || model.size < 20 * 1024 * 1024) {
    badges.push({ label: '轻量', icon: Zap, color: 'bg-la-success/10 text-la-success border-la-success/20' })
  }
  if (model.id.includes('medium') || (model.size >= 20 * 1024 * 1024 && model.size < 100 * 1024 * 1024)) {
    badges.push({ label: '平衡', icon: Scale, color: 'bg-la-info/10 text-la-info border-la-info/20' })
  }
  if (model.id.includes('large') || model.size >= 100 * 1024 * 1024) {
    badges.push({ label: '精准', icon: Target, color: 'bg-la-violet/10 text-la-violet border-la-violet/20' })
  }
  return badges
}

// 格式化文件大小
function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

// 初始化
onMounted(async () => {
  await setupListeners()
  await loadModels()
})
</script>

<template>
  <div class="relative min-h-screen flex flex-col items-center justify-center p-8">
    <!-- 标题 -->
    <div class="text-center mb-8">
      <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl la-gradient mb-4 shadow-lg shadow-la-violet/20">
        <Download class="w-8 h-8 text-white" />
      </div>
      <h1 class="text-2xl font-bold mb-2">下载语音模型</h1>
      <p class="text-muted-foreground">
        选择一个模型开始使用，推荐先下载小模型快速体验
      </p>
    </div>

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

    <!-- 模型列表 -->
    <div class="w-full max-w-lg space-y-3 mb-8">
      <div v-if="isLoading" class="text-center py-8">
        <Loader2 class="w-8 h-8 animate-spin mx-auto mb-2 text-la-indigo" />
        <p class="text-muted-foreground">加载模型列表...</p>
      </div>

      <Card
        v-for="model in models"
        :key="model.id"
        class="bg-card/50 border-border/50 backdrop-blur-sm transition-all duration-200"
        :class="{ 
          'border-la-success/30 bg-la-success/5': model.downloaded,
          'hover:border-border': !model.downloaded
        }"
      >
        <CardHeader class="pb-2">
          <div class="flex items-start justify-between">
            <div>
              <CardTitle class="text-base flex items-center gap-2">
                {{ model.name }}
                <Check
                  v-if="model.downloaded"
                  class="w-4 h-4 text-la-success"
                />
              </CardTitle>
              <CardDescription class="text-xs mt-1">
                {{ model.description }}
              </CardDescription>
            </div>
            <div class="flex items-center gap-1 text-xs text-muted-foreground">
              <HardDrive class="w-3 h-3" />
              {{ formatSize(model.size) }}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <!-- 特性标签 -->
          <div v-if="getModelBadges(model).length > 0" class="flex gap-2 mb-3">
            <Badge
              v-for="badge in getModelBadges(model)"
              :key="badge.label"
              variant="outline"
              :class="badge.color"
            >
              <component :is="badge.icon" class="w-3 h-3 mr-1" />
              {{ badge.label }}
            </Badge>
          </div>

          <!-- 下载进度 -->
          <div v-if="downloadingModelId === model.id" class="space-y-2">
            <Progress :model-value="getProgress(model.id)?.overall_progress || 0" class="h-2" />
            <p class="text-xs text-muted-foreground">
              {{ getProgress(model.id)?.current_file || '准备下载...' }}
              {{ Math.round(getProgress(model.id)?.overall_progress || 0) }}%
            </p>
          </div>

          <!-- 操作按钮 -->
          <div v-else class="flex gap-2">
            <Button
              v-if="!model.downloaded"
              size="sm"
              variant="secondary"
              class="gap-2"
              :disabled="isDownloading"
              @click="handleDownload(model.id)"
            >
              <Download class="w-4 h-4" />
              下载
            </Button>
            <Badge v-else variant="outline" class="bg-la-success/10 text-la-success border-la-success/20">
              <Check class="w-3 h-3 mr-1" />
              已下载
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- 操作按钮 -->
    <div class="flex flex-col items-center gap-3">
      <Button
        size="lg"
        class="px-8"
        :disabled="!models.some(m => m.downloaded)"
        @click="continueNext"
      >
        {{ models.some(m => m.downloaded) ? '开始使用' : '请先下载一个模型' }}
      </Button>
      
      <!-- 跳过按钮 -->
      <Button
        variant="ghost"
        size="sm"
        class="text-muted-foreground hover:text-foreground"
        @click="skipStep"
      >
        跳过，稍后下载
      </Button>
    </div>

    <!-- 提示 -->
    <p class="mt-4 text-xs text-muted-foreground text-center max-w-sm">
      跳过后语音识别功能将无法使用，你可以稍后在设置中下载模型
    </p>
  </div>
</template>
