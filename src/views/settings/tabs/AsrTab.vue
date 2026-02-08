<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useAsrConfig } from '@/composables/useConfig'
import { useAsrProvider, ASR_PROVIDERS } from '@/composables/useAsrProvider'
import { useModels } from '@/composables/useModels'
import MaterialIcon from '@/components/common/MaterialIcon.vue'
import type { AsrProviderType } from '@/types/bindings'

const {
  asrProvider,
  openaiWhisperConfig,
  deepgramConfig,
  setAsrProvider,
  updateOpenAiWhisperConfig,
  updateDeepgramConfig,
} = useAsrConfig()

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

// 编辑中的 API Key（避免直接暴露）
const editingWhisperKey = ref('')
const editingDeepgramKey = ref('')

// 当配置加载完成后同步到编辑 ref
watch(
  openaiWhisperConfig,
  (config) => {
    if (config?.apiKey && !editingWhisperKey.value) {
      editingWhisperKey.value = config.apiKey
    }
  },
  { immediate: true },
)

watch(
  deepgramConfig,
  (config) => {
    if (config?.apiKey && !editingDeepgramKey.value) {
      editingDeepgramKey.value = config.apiKey
    }
  },
  { immediate: true },
)

async function onProviderChange(provider: AsrProviderType) {
  await setAsrProvider(provider)
}

async function saveWhisperConfig() {
  await updateOpenAiWhisperConfig({ apiKey: editingWhisperKey.value })
}

async function saveDeepgramConfig() {
  await updateDeepgramConfig({ apiKey: editingDeepgramKey.value })
}

async function handleTestConnection() {
  // 先保存再测试
  if (asrProvider.value === 'openai_whisper') {
    await saveWhisperConfig()
  } else if (asrProvider.value === 'deepgram') {
    await saveDeepgramConfig()
  }
  await testConnection(asrProvider.value)
}

// 初始化模型列表
onMounted(async () => {
  await setupListeners()
  await loadModels()
})
</script>

<template>
  <div class="space-y-8">
    <!-- 标题 -->
    <div>
      <h2 class="text-lg font-semibold mb-1" style="color: var(--la-text-primary)">语音识别</h2>
      <p class="text-sm" style="color: var(--la-text-secondary)">
        选择和配置语音识别引擎
      </p>
    </div>

    <!-- Provider 选择 -->
    <div class="space-y-3">
      <h3 class="text-sm font-medium" style="color: var(--la-text-primary)">识别引擎</h3>
      <div class="grid grid-cols-1 gap-2">
        <button
          v-for="provider in ASR_PROVIDERS"
          :key="provider.type"
          class="w-full p-4 rounded-lg text-left transition-all"
          :style="
            asrProvider === provider.type
              ? {
                  border: '2px solid var(--la-accent)',
                  backgroundColor: 'var(--la-accent-dim)',
                }
              : {
                  border: '1px solid var(--la-border)',
                  backgroundColor: 'var(--la-bg-surface)',
                }
          "
          @click="onProviderChange(provider.type)"
        >
          <div class="flex items-center gap-3">
            <MaterialIcon
              :name="provider.icon"
              size="sm"
              :style="
                asrProvider === provider.type
                  ? { color: 'var(--la-accent)' }
                  : { color: 'var(--la-text-secondary)' }
              "
            />
            <div class="flex-1">
              <div class="text-sm font-medium" style="color: var(--la-text-primary)">
                {{ provider.name }}
              </div>
              <div class="text-xs" style="color: var(--la-text-tertiary)">
                {{ provider.description }}
              </div>
            </div>
            <MaterialIcon
              v-if="asrProvider === provider.type"
              name="check_circle"
              size="sm"
              style="color: var(--la-accent)"
            />
          </div>
        </button>
      </div>
    </div>

    <!-- 本地模型管理 -->
    <div v-if="asrProvider === 'local'" class="space-y-3">
      <h3 class="text-sm font-medium" style="color: var(--la-text-primary)">本地模型</h3>

      <div v-if="modelsLoading" class="py-4 text-center">
        <MaterialIcon
          name="progress_activity"
          size="lg"
          class="animate-spin"
          style="color: var(--la-accent)"
        />
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="m in models"
          :key="m.id"
          class="p-3 rounded-lg flex items-center gap-3"
          style="border: 1px solid var(--la-border); background-color: var(--la-bg-surface)"
        >
          <MaterialIcon name="memory" size="sm" style="color: var(--la-text-secondary)" />
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium" style="color: var(--la-text-primary)">
              {{ m.name }}
            </div>
            <div class="text-xs" style="color: var(--la-text-tertiary)">
              {{ m.description || 'ASR model' }}
            </div>
          </div>

          <!-- 下载中 -->
          <div v-if="downloadingModelId === m.id" class="w-20">
            <div
              class="h-1.5 rounded-full overflow-hidden"
              style="background-color: var(--la-bg-inset)"
            >
              <div
                class="h-full rounded-full"
                style="background-color: var(--la-accent)"
                :style="{ width: `${getProgress(m.id)?.overall_progress || 0}%` }"
              />
            </div>
          </div>
          <MaterialIcon
            v-else-if="m.downloaded"
            name="check_circle"
            size="sm"
            style="color: var(--la-tier2-green)"
          />
          <button
            v-else
            class="px-3 py-1 rounded text-xs font-medium"
            style="background-color: var(--la-accent); color: var(--la-text-inverted)"
            :disabled="isDownloading"
            @click="downloadModel(m.id)"
          >
            Download
          </button>
        </div>
      </div>
    </div>

    <!-- OpenAI Whisper 配置 -->
    <div v-if="asrProvider === 'openai_whisper'" class="space-y-4">
      <h3 class="text-sm font-medium" style="color: var(--la-text-primary)">OpenAI Whisper 配置</h3>

      <div>
        <label class="block text-xs font-medium mb-1.5" style="color: var(--la-text-secondary)">
          API Key
        </label>
        <input
          v-model="editingWhisperKey"
          type="password"
          placeholder="sk-..."
          class="w-full px-3 py-2 rounded-lg text-sm outline-none"
          style="
            border: 1px solid var(--la-border);
            background-color: var(--la-bg-surface);
            color: var(--la-text-primary);
          "
          @blur="saveWhisperConfig"
        />
      </div>

      <div class="flex gap-3">
        <button
          class="px-4 py-2 rounded-lg text-sm font-medium"
          style="
            border: 1px solid var(--la-border);
            background-color: var(--la-bg-surface);
            color: var(--la-text-primary);
          "
          :disabled="!editingWhisperKey || isTesting"
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
      </div>

      <div
        v-if="testResult"
        class="px-3 py-2 rounded-lg text-xs font-medium"
        :style="
          testResult.success
            ? { backgroundColor: 'rgba(52,199,89,0.1)', color: 'var(--la-tier2-green)' }
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
    </div>

    <!-- Deepgram 配置 -->
    <div v-if="asrProvider === 'deepgram'" class="space-y-4">
      <h3 class="text-sm font-medium" style="color: var(--la-text-primary)">Deepgram 配置</h3>

      <div>
        <label class="block text-xs font-medium mb-1.5" style="color: var(--la-text-secondary)">
          API Key
        </label>
        <input
          v-model="editingDeepgramKey"
          type="password"
          placeholder="Enter Deepgram API key"
          class="w-full px-3 py-2 rounded-lg text-sm outline-none"
          style="
            border: 1px solid var(--la-border);
            background-color: var(--la-bg-surface);
            color: var(--la-text-primary);
          "
          @blur="saveDeepgramConfig"
        />
      </div>

      <div class="flex gap-3">
        <button
          class="px-4 py-2 rounded-lg text-sm font-medium"
          style="
            border: 1px solid var(--la-border);
            background-color: var(--la-bg-surface);
            color: var(--la-text-primary);
          "
          :disabled="!editingDeepgramKey || isTesting"
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
      </div>

      <div
        v-if="testResult"
        class="px-3 py-2 rounded-lg text-xs font-medium"
        :style="
          testResult.success
            ? { backgroundColor: 'rgba(52,199,89,0.1)', color: 'var(--la-tier2-green)' }
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
    </div>
  </div>
</template>
