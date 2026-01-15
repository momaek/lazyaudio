<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useModels } from '@/composables/useModels'
import { useAppStore } from '@/stores/app'
import MaterialIcon from '@/components/common/MaterialIcon.vue'
import type { ModelInfo } from '@/types'
import { Progress } from '@/components/ui/progress'

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

// 检查是否有已下载的模型
const hasDownloadedModel = computed(() => {
  return models.value.some(m => m.downloaded)
})

// 获取推荐模型
const recommendedModel = computed(() => {
  return models.value.find(m => m.id.includes('zipformer'))
})

// 格式化文件大小
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// 初始化
onMounted(async () => {
  await setupListeners()
  await loadModels()
})
</script>

<template>
  <div class="min-h-screen flex flex-col font-display bg-background-dark-soft text-white">
    <!-- 顶部导航 -->
    <header class="flex items-center justify-between border-b border-border-dark px-8 py-5 bg-background-dark-soft/80 backdrop-blur-md">
      <div class="flex items-center gap-3">
        <div class="size-8 bg-brand-primary rounded-lg flex items-center justify-center">
          <MaterialIcon name="graphic_eq" size="lg" weight="700" class="text-white" />
        </div>
        <h2 class="text-lg font-bold tracking-tight">LazyAudio</h2>
      </div>
      <div class="flex items-center gap-4">
        <button class="size-10 rounded-lg text-text-dim-dark hover:text-white hover:bg-white/5 transition-colors flex items-center justify-center">
          <MaterialIcon name="settings" />
        </button>
        <button class="size-10 rounded-lg text-text-dim-dark hover:text-white hover:bg-white/5 transition-colors flex items-center justify-center">
          <MaterialIcon name="help" />
        </button>
      </div>
    </header>

    <!-- 主内容 -->
    <main class="flex-1 flex flex-col items-center p-8 pt-16">
      <!-- 面包屑 -->
      <div class="w-full max-w-[800px] mb-8">
        <div class="flex items-center gap-2 text-sm">
          <span class="text-text-dim-dark">Onboarding</span>
          <MaterialIcon name="chevron_right" size="sm" class="text-text-dim-dark" />
          <span class="text-brand-primary font-medium">Model Download</span>
        </div>
      </div>

      <!-- 标题区 -->
      <div class="w-full max-w-[800px] mb-12">
        <h1 class="text-4xl md:text-5xl font-bold tracking-tighter mb-4">
          Setting up your local engine
        </h1>
        <p class="text-lg text-text-muted-dark">
          Your audio never leaves this computer. All processing is local.
        </p>
      </div>

      <!-- 模型卡片 -->
      <div class="w-full max-w-[800px] mb-12">
        <div v-if="isLoading" class="text-center py-12">
          <MaterialIcon name="progress_activity" size="2xl" class="animate-spin text-brand-primary mx-auto mb-4" />
          <p class="text-text-muted-dark">Loading models...</p>
        </div>

        <div
          v-for="model in models"
          :key="model.id"
          class="p-8 md:p-12 rounded-2xl border transition-all bg-surface-dark-alt/40 dark:border-white/5 shadow-2xl backdrop-blur-sm"
        >
          <!-- 模型头部 -->
          <div class="flex items-start gap-6 mb-6">
            <div class="size-16 rounded-xl flex items-center justify-center bg-brand-primary/10 border border-brand-primary/20 shrink-0">
              <MaterialIcon name="database" size="xl" class="text-brand-primary" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-3 mb-2">
                <h3 class="text-2xl font-bold truncate">{{ model.name }}</h3>
                <span 
                  v-if="model.id.includes('zipformer')"
                  class="px-2 py-0.5 rounded-full bg-brand-primary/20 text-brand-primary text-xs font-bold uppercase tracking-wider"
                >
                  Recommended
                </span>
              </div>
              <p class="text-text-dim-dark">{{ model.description || 'Streaming ASR model' }}</p>
            </div>
          </div>

          <!-- 下载状态 -->
          <div v-if="downloadingModelId === model.id" class="space-y-4 mb-6">
            <div class="flex items-center justify-between text-sm">
              <div>
                <p class="text-white font-medium mb-1">DOWNLOAD STATUS</p>
                <p class="text-text-dim-dark">
                  {{ Math.round(getProgress(model.id)?.overall_progress || 0) }}% Complete
                </p>
              </div>
              <div class="text-right">
                <p class="text-white font-medium mb-1">SPEED</p>
                <p class="text-text-dim-dark font-mono">-- MB/s</p>
              </div>
            </div>
            
            <!-- 进度条 -->
            <div class="relative h-4 bg-white/5 rounded-full overflow-hidden progress-shimmer">
              <div 
                class="h-full bg-brand-primary rounded-full transition-all duration-300"
                :style="{ width: `${getProgress(model.id)?.overall_progress || 0}%` }"
              />
            </div>

            <!-- 进度文本 -->
            <div class="flex items-center justify-between text-xs">
              <p class="text-text-dim-dark">
                {{ getProgress(model.id)?.current_file || 'Downloading language models...' }}
              </p>
              <p class="text-text-dim-dark font-mono">-- remaining</p>
            </div>
          </div>

          <!-- 已下载状态 -->
          <div v-else-if="model.downloaded" class="flex items-center gap-3 p-4 rounded-lg bg-brand-primary/10 border border-brand-primary/20 mb-6">
            <MaterialIcon name="check_circle" size="lg" class="text-brand-primary" />
            <span class="text-sm font-medium text-brand-primary">Model ready to use</span>
          </div>

          <!-- 未下载状态 -->
          <div v-else class="mb-6">
            <button
              class="w-full py-4 rounded-xl font-bold bg-brand-primary hover:brightness-110 text-white transition-all"
              :disabled="isDownloading"
              @click="handleDownload(model.id)"
            >
              <MaterialIcon 
                v-if="isDownloading"
                name="progress_activity" 
                size="md"
                class="inline-block animate-spin mr-2"
              />
              <MaterialIcon 
                v-else
                name="download" 
                size="md"
                class="inline-block mr-2"
              />
              {{ isDownloading ? 'Downloading...' : 'Download Model' }}
            </button>
          </div>
        </div>
      </div>

      <!-- 底部操作 -->
      <div class="w-full max-w-[800px] flex flex-col items-center gap-6">
        <button
          class="w-full max-w-[320px] py-4 rounded-xl font-bold border transition-all"
          :class="[
            hasDownloadedModel 
              ? 'bg-brand-primary text-white hover:brightness-110 border-transparent'
              : 'bg-white/5 text-white/20 cursor-not-allowed border-white/5'
          ]"
          :disabled="!hasDownloadedModel"
          @click="continueNext"
        >
          {{ hasDownloadedModel ? 'Start Transcribing' : 'Download a model first' }}
        </button>

        <!-- 安全标识 -->
        <div class="flex items-center gap-2 px-4 py-2 rounded-full bg-brand-primary/5 border border-brand-primary/10">
          <MaterialIcon name="lock" size="sm" class="text-brand-primary" />
          <span class="text-xs text-text-dim-dark">End-to-end encrypted local workflow</span>
        </div>
      </div>
    </main>
  </div>
</template>
