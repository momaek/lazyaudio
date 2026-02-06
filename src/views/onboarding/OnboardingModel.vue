<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useModels } from '@/composables/useModels'
import { useAppStore } from '@/stores/app'
import MaterialIcon from '@/components/common/MaterialIcon.vue'

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

async function handleDownload(modelId: string) {
  await downloadModel(modelId)
}

async function continueNext() {
  appStore.setOnboardingCompleted(true)
  const lastMode = appStore.getLastMode()
  if (lastMode) {
    router.push(`/mode/${lastMode}`)
  } else {
    router.push('/home')
  }
}

const hasDownloadedModel = computed(() => {
  return models.value.some((m) => m.downloaded)
})

onMounted(async () => {
  await setupListeners()
  await loadModels()
})
</script>

<template>
  <div class="w-full max-w-[520px] flex flex-col items-center gap-8 px-6">
    <!-- Logo -->
    <div
      class="size-12 rounded-xl flex items-center justify-center"
      style="background-color: var(--la-accent)"
    >
      <MaterialIcon name="model_training" size="lg" style="color: var(--la-text-inverted)" />
    </div>

    <!-- 标题 -->
    <div class="text-center">
      <h1 class="text-[28px] font-bold mb-2" style="color: var(--la-text-primary)">
        Speech Recognition Model
      </h1>
      <p class="text-sm" style="color: var(--la-text-secondary)">
        All processing happens locally. Your audio never leaves this device.
      </p>
    </div>

    <!-- 加载状态 -->
    <div v-if="isLoading" class="flex flex-col items-center gap-3 py-8">
      <MaterialIcon
        name="progress_activity"
        size="xl"
        class="animate-spin"
        style="color: var(--la-accent)"
      />
      <p class="text-sm" style="color: var(--la-text-secondary)">Loading models...</p>
    </div>

    <!-- 模型卡片列表 -->
    <div v-else class="w-full flex flex-col gap-3">
      <div
        v-for="model in models"
        :key="model.id"
        class="p-4 rounded-[10px] transition-colors"
        :style="
          model.downloaded
            ? { border: '2px solid var(--la-accent)', backgroundColor: 'var(--la-bg-surface)' }
            : { border: '1px solid var(--la-border)', backgroundColor: 'var(--la-bg-surface)' }
        "
      >
        <div class="flex items-start gap-3">
          <!-- 模型图标 -->
          <div
            class="size-9 rounded-lg flex items-center justify-center shrink-0"
            style="background-color: var(--la-bg-inset); color: var(--la-text-secondary)"
          >
            <MaterialIcon name="memory" size="sm" />
          </div>

          <!-- 模型信息 -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <h3 class="text-sm font-semibold" style="color: var(--la-text-primary)">
                {{ model.name }}
              </h3>
              <span
                v-if="model.id.includes('zipformer')"
                class="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
                style="background-color: var(--la-accent-dim); color: var(--la-accent)"
              >
                Recommended
              </span>
            </div>
            <p class="text-xs mb-3" style="color: var(--la-text-tertiary)">
              {{ model.description || 'Streaming ASR model' }}
            </p>

            <!-- 下载中状态 -->
            <div v-if="downloadingModelId === model.id" class="space-y-2">
              <div
                class="h-1.5 rounded-full overflow-hidden"
                style="background-color: var(--la-bg-inset)"
              >
                <div
                  class="h-full rounded-full transition-all duration-300 progress-shimmer"
                  style="background-color: var(--la-accent)"
                  :style="{ width: `${getProgress(model.id)?.overall_progress || 0}%` }"
                />
              </div>
              <p class="text-xs" style="color: var(--la-text-tertiary)">
                {{ Math.round(getProgress(model.id)?.overall_progress || 0) }}% —
                {{ getProgress(model.id)?.current_file || 'Downloading...' }}
              </p>
            </div>

            <!-- 已下载 -->
            <div
              v-else-if="model.downloaded"
              class="flex items-center gap-1.5"
            >
              <MaterialIcon name="check_circle" size="sm" style="color: var(--la-tier2-green)" />
              <span class="text-xs font-medium" style="color: var(--la-tier2-green)">
                Ready to use
              </span>
            </div>

            <!-- 下载按钮 -->
            <button
              v-else
              class="px-4 py-1.5 rounded-md text-xs font-semibold transition-opacity"
              style="background-color: var(--la-accent); color: var(--la-text-inverted)"
              :disabled="isDownloading"
              @click="handleDownload(model.id)"
            >
              <MaterialIcon
                v-if="isDownloading"
                name="progress_activity"
                size="sm"
                class="animate-spin mr-1"
              />
              <MaterialIcon v-else name="download" size="sm" class="mr-1" />
              {{ isDownloading ? 'Downloading...' : 'Download' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 继续按钮 -->
    <button
      class="w-full max-w-[320px] py-3 rounded-md text-sm font-semibold transition-opacity"
      :style="
        hasDownloadedModel
          ? { backgroundColor: 'var(--la-accent)', color: 'var(--la-text-inverted)' }
          : { backgroundColor: 'var(--la-bg-surface)', color: 'var(--la-text-muted)', cursor: 'not-allowed', opacity: '0.5' }
      "
      :disabled="!hasDownloadedModel"
      @click="continueNext"
    >
      {{ hasDownloadedModel ? 'Start Transcribing' : 'Download a model first' }}
    </button>

    <!-- 步骤指示器 -->
    <div class="flex items-center gap-2">
      <span class="size-2 rounded-full" style="background-color: var(--la-border)" />
      <span class="size-2 rounded-full" style="background-color: var(--la-accent)" />
    </div>

    <!-- 安全提示 -->
    <div class="flex items-center gap-2 py-2">
      <MaterialIcon name="lock" size="sm" style="color: var(--la-text-tertiary)" />
      <span class="text-xs" style="color: var(--la-text-tertiary)">
        Local-only processing — your data stays on this device
      </span>
    </div>
  </div>
</template>
