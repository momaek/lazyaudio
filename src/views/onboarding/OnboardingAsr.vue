<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useModels } from '@/composables/useModels'
import { useAsrConfig } from '@/composables/useConfig'
import { useAsrProvider, ASR_PROVIDERS } from '@/composables/useAsrProvider'
import { useAppStore } from '@/stores/app'
import MaterialIcon from '@/components/common/MaterialIcon.vue'
import type { AsrProviderType } from '@/types/bindings'

const router = useRouter()
const appStore = useAppStore()
const { setAsrProvider, updateOpenAiWhisperConfig, updateDeepgramConfig } =
  useAsrConfig()
const { isTesting, testResult, testConnection } = useAsrProvider()
const {
  models,
  isLoading: modelsLoading,
  isDownloading,
  downloadingModelId,
  loadModels,
  downloadModel,
  setupListeners,
  getProgress,
} = useModels()

// 三阶段：choose | local | cloud
const step = ref<'choose' | 'local' | 'cloud'>('choose')

// Cloud 配置
const selectedCloudProvider = ref<AsrProviderType>('openai_whisper')
const apiKey = ref('')
const baseUrl = ref('')
const model = ref('')

// 云端 Provider 列表（排除 local）
const cloudProviders = ASR_PROVIDERS.filter((p) => !p.isLocal)

function selectLocal() {
  step.value = 'local'
}

function selectCloud() {
  step.value = 'cloud'
  // 初始化默认值
  onCloudProviderChange(selectedCloudProvider.value)
}

function goBack() {
  step.value = 'choose'
  testResult.value = null
}

function onCloudProviderChange(provider: AsrProviderType) {
  selectedCloudProvider.value = provider
  apiKey.value = ''
  testResult.value = null

  if (provider === 'openai_whisper') {
    baseUrl.value = 'https://api.openai.com/v1'
    model.value = 'whisper-1'
  } else if (provider === 'deepgram') {
    baseUrl.value = 'wss://api.deepgram.com/v1/listen'
    model.value = 'nova-2'
  }
}

async function handleTestConnection() {
  // 先保存 Provider 配置（API Key 等），但不切换全局 Provider
  if (selectedCloudProvider.value === 'openai_whisper') {
    await updateOpenAiWhisperConfig({
      apiKey: apiKey.value,
      baseUrl: baseUrl.value,
      model: model.value,
      language: '',
    })
  } else if (selectedCloudProvider.value === 'deepgram') {
    await updateDeepgramConfig({
      apiKey: apiKey.value,
      baseUrl: baseUrl.value,
      model: model.value,
      language: '',
    })
  }

  // 先临时设置 Provider 以便后端 test 能读到正确的配置
  await setAsrProvider(selectedCloudProvider.value)
  const success = await testConnection(selectedCloudProvider.value)

  // 测试失败时回退到 local，避免全局配置指向不可用 Provider
  if (!success) {
    await setAsrProvider('local')
  }
}

async function handleDownload(modelId: string) {
  await downloadModel(modelId)
}

const hasDownloadedModel = computed(() => {
  return models.value.some((m) => m.downloaded)
})

const canContinueCloud = computed(() => {
  return testResult.value?.success === true
})

async function continueNext() {
  if (step.value === 'local') {
    await setAsrProvider('local')
  }
  // cloud provider 已在 testConnection 时保存

  appStore.setOnboardingCompleted(true)
  const lastMode = appStore.getLastMode()
  if (lastMode) {
    router.push(`/mode/${lastMode}`)
  } else {
    router.push('/home')
  }
}

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
      <MaterialIcon name="record_voice_over" size="lg" style="color: var(--la-text-inverted)" />
    </div>

    <!-- ====== 阶段 A：选择转录方式 ====== -->
    <template v-if="step === 'choose'">
      <div class="text-center">
        <h1 class="text-[28px] font-bold mb-2" style="color: var(--la-text-primary)">
          Speech Recognition
        </h1>
        <p class="text-sm" style="color: var(--la-text-secondary)">
          Choose how you want to transcribe audio
        </p>
      </div>

      <div class="w-full flex flex-col gap-3">
        <!-- 本地模式卡片 -->
        <button
          class="w-full p-5 rounded-xl text-left transition-all"
          style="
            border: 1px solid var(--la-border);
            background-color: var(--la-bg-surface);
          "
          @click="selectLocal"
        >
          <div class="flex items-start gap-4">
            <div
              class="size-10 rounded-lg flex items-center justify-center shrink-0"
              style="background-color: var(--la-accent-dim); color: var(--la-accent)"
            >
              <MaterialIcon name="memory" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <h3 class="text-sm font-semibold" style="color: var(--la-text-primary)">
                  Local Models
                </h3>
                <span
                  class="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
                  style="background-color: var(--la-accent-dim); color: var(--la-accent)"
                >
                  Recommended
                </span>
              </div>
              <p class="text-xs" style="color: var(--la-text-tertiary)">
                Offline, private, no internet required. Uses on-device AI models.
              </p>
            </div>
            <MaterialIcon name="chevron_right" size="sm" style="color: var(--la-text-muted)" />
          </div>
        </button>

        <!-- 云端 API 卡片 -->
        <button
          class="w-full p-5 rounded-xl text-left transition-all"
          style="
            border: 1px solid var(--la-border);
            background-color: var(--la-bg-surface);
          "
          @click="selectCloud"
        >
          <div class="flex items-start gap-4">
            <div
              class="size-10 rounded-lg flex items-center justify-center shrink-0"
              style="background-color: var(--la-bg-inset); color: var(--la-text-secondary)"
            >
              <MaterialIcon name="cloud" />
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="text-sm font-semibold mb-1" style="color: var(--la-text-primary)">
                Cloud API
              </h3>
              <p class="text-xs" style="color: var(--la-text-tertiary)">
                Higher accuracy, supports more languages. Requires API key and internet.
              </p>
            </div>
            <MaterialIcon name="chevron_right" size="sm" style="color: var(--la-text-muted)" />
          </div>
        </button>
      </div>
    </template>

    <!-- ====== 阶段 B：本地模型下载 ====== -->
    <template v-if="step === 'local'">
      <div class="text-center">
        <h1 class="text-[28px] font-bold mb-2" style="color: var(--la-text-primary)">
          Download Model
        </h1>
        <p class="text-sm" style="color: var(--la-text-secondary)">
          All processing happens locally. Your audio never leaves this device.
        </p>
      </div>

      <!-- 加载状态 -->
      <div v-if="modelsLoading" class="flex flex-col items-center gap-3 py-8">
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
          v-for="m in models"
          :key="m.id"
          class="p-4 rounded-[10px] transition-colors"
          :style="
            m.downloaded
              ? { border: '2px solid var(--la-accent)', backgroundColor: 'var(--la-bg-surface)' }
              : { border: '1px solid var(--la-border)', backgroundColor: 'var(--la-bg-surface)' }
          "
        >
          <div class="flex items-start gap-3">
            <div
              class="size-9 rounded-lg flex items-center justify-center shrink-0"
              style="background-color: var(--la-bg-inset); color: var(--la-text-secondary)"
            >
              <MaterialIcon name="memory" size="sm" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <h3 class="text-sm font-semibold" style="color: var(--la-text-primary)">
                  {{ m.name }}
                </h3>
                <span
                  v-if="m.id.includes('zipformer')"
                  class="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
                  style="background-color: var(--la-accent-dim); color: var(--la-accent)"
                >
                  Recommended
                </span>
              </div>
              <p class="text-xs mb-3" style="color: var(--la-text-tertiary)">
                {{ m.description || 'Streaming ASR model' }}
              </p>

              <!-- 下载中 -->
              <div v-if="downloadingModelId === m.id" class="space-y-2">
                <div
                  class="h-1.5 rounded-full overflow-hidden"
                  style="background-color: var(--la-bg-inset)"
                >
                  <div
                    class="h-full rounded-full transition-all duration-300 progress-shimmer"
                    style="background-color: var(--la-accent)"
                    :style="{ width: `${getProgress(m.id)?.overall_progress || 0}%` }"
                  />
                </div>
                <p class="text-xs" style="color: var(--la-text-tertiary)">
                  {{ Math.round(getProgress(m.id)?.overall_progress || 0) }}% —
                  {{ getProgress(m.id)?.current_file || 'Downloading...' }}
                </p>
              </div>

              <!-- 已下载 -->
              <div v-else-if="m.downloaded" class="flex items-center gap-1.5">
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
                @click="handleDownload(m.id)"
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

      <!-- 操作按钮 -->
      <div class="w-full flex flex-col items-center gap-3">
        <button
          class="w-full max-w-[320px] py-3 rounded-md text-sm font-semibold transition-opacity"
          :style="
            hasDownloadedModel
              ? { backgroundColor: 'var(--la-accent)', color: 'var(--la-text-inverted)' }
              : {
                  backgroundColor: 'var(--la-bg-surface)',
                  color: 'var(--la-text-muted)',
                  cursor: 'not-allowed',
                  opacity: '0.5',
                }
          "
          :disabled="!hasDownloadedModel"
          @click="continueNext"
        >
          {{ hasDownloadedModel ? 'Start Transcribing' : 'Download a model first' }}
        </button>
        <button
          class="text-xs font-medium py-1"
          style="color: var(--la-text-tertiary)"
          @click="goBack"
        >
          Back to selection
        </button>
      </div>
    </template>

    <!-- ====== 阶段 C：云端 API 配置 ====== -->
    <template v-if="step === 'cloud'">
      <div class="text-center">
        <h1 class="text-[28px] font-bold mb-2" style="color: var(--la-text-primary)">
          Cloud API Setup
        </h1>
        <p class="text-sm" style="color: var(--la-text-secondary)">
          Configure your preferred speech recognition API
        </p>
      </div>

      <div class="w-full flex flex-col gap-5">
        <!-- Provider 选择 -->
        <div>
          <label class="block text-xs font-medium mb-2" style="color: var(--la-text-secondary)">
            Provider
          </label>
          <div class="flex gap-2">
            <button
              v-for="cp in cloudProviders"
              :key="cp.type"
              class="flex-1 p-3 rounded-lg text-center text-xs font-medium transition-all"
              :style="
                selectedCloudProvider === cp.type
                  ? {
                      border: '2px solid var(--la-accent)',
                      backgroundColor: 'var(--la-accent-dim)',
                      color: 'var(--la-accent)',
                    }
                  : {
                      border: '1px solid var(--la-border)',
                      backgroundColor: 'var(--la-bg-surface)',
                      color: 'var(--la-text-secondary)',
                    }
              "
              @click="onCloudProviderChange(cp.type)"
            >
              <MaterialIcon :name="cp.icon" size="sm" class="mb-1" />
              <div>{{ cp.name }}</div>
            </button>
          </div>
        </div>

        <!-- API Key -->
        <div>
          <label class="block text-xs font-medium mb-2" style="color: var(--la-text-secondary)">
            API Key
          </label>
          <input
            v-model="apiKey"
            type="password"
            placeholder="Enter your API key"
            class="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors"
            style="
              border: 1px solid var(--la-border);
              background-color: var(--la-bg-surface);
              color: var(--la-text-primary);
            "
          />
        </div>

        <!-- Base URL (可选) -->
        <div>
          <label class="block text-xs font-medium mb-2" style="color: var(--la-text-secondary)">
            Base URL
            <span class="font-normal" style="color: var(--la-text-muted)">(optional)</span>
          </label>
          <input
            v-model="baseUrl"
            type="text"
            class="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors"
            style="
              border: 1px solid var(--la-border);
              background-color: var(--la-bg-surface);
              color: var(--la-text-primary);
            "
          />
        </div>

        <!-- Model -->
        <div>
          <label class="block text-xs font-medium mb-2" style="color: var(--la-text-secondary)">
            Model
          </label>
          <input
            v-model="model"
            type="text"
            class="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors"
            style="
              border: 1px solid var(--la-border);
              background-color: var(--la-bg-surface);
              color: var(--la-text-primary);
            "
          />
        </div>

        <!-- 测试结果 -->
        <div
          v-if="testResult"
          class="px-3 py-2.5 rounded-lg text-xs font-medium"
          :style="
            testResult.success
              ? { backgroundColor: 'var(--la-tier2-green-dim, rgba(52,199,89,0.1))', color: 'var(--la-tier2-green)' }
              : { backgroundColor: 'rgba(255,59,48,0.1)', color: '#ff3b30' }
          "
        >
          <MaterialIcon
            :name="testResult.success ? 'check_circle' : 'error'"
            size="sm"
            class="mr-1"
          />
          {{ testResult.message }}
        </div>

        <!-- 操作按钮 -->
        <div class="flex gap-3">
          <button
            class="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-opacity"
            style="
              border: 1px solid var(--la-border);
              background-color: var(--la-bg-surface);
              color: var(--la-text-primary);
            "
            :disabled="!apiKey || isTesting"
            :style="!apiKey ? { opacity: '0.5', cursor: 'not-allowed' } : {}"
            @click="handleTestConnection"
          >
            <MaterialIcon
              v-if="isTesting"
              name="progress_activity"
              size="sm"
              class="animate-spin mr-1"
            />
            {{ isTesting ? 'Testing...' : 'Test Connection' }}
          </button>
          <button
            class="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-opacity"
            :style="
              canContinueCloud
                ? { backgroundColor: 'var(--la-accent)', color: 'var(--la-text-inverted)' }
                : {
                    backgroundColor: 'var(--la-bg-surface)',
                    color: 'var(--la-text-muted)',
                    cursor: 'not-allowed',
                    opacity: '0.5',
                  }
            "
            :disabled="!canContinueCloud"
            @click="continueNext"
          >
            Continue
          </button>
        </div>

        <button
          class="text-xs font-medium py-1"
          style="color: var(--la-text-tertiary)"
          @click="goBack"
        >
          Back to selection
        </button>
      </div>
    </template>

    <!-- 步骤指示器 -->
    <div class="flex items-center gap-2">
      <span class="size-2 rounded-full" style="background-color: var(--la-border)" />
      <span class="size-2 rounded-full" style="background-color: var(--la-accent)" />
    </div>

    <!-- 安全提示 -->
    <div v-if="step !== 'cloud'" class="flex items-center gap-2 py-2">
      <MaterialIcon name="lock" size="sm" style="color: var(--la-text-tertiary)" />
      <span class="text-xs" style="color: var(--la-text-tertiary)">
        Local-only processing — your data stays on this device
      </span>
    </div>
  </div>
</template>
