/**
 * 配置 Composable
 *
 * 提供应用配置的读写访问
 */

import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import type {
  AppConfig,
  Theme,
  Language,
  AsrConfig,
  AsrProviderType,
  AudioConfig,
  AiConfig,
  OpenAiWhisperConfig,
  DeepgramConfig,
} from '@/types/bindings'

// ============================================================================
// useConfig Composable
// ============================================================================

/**
 * 配置 Hook
 *
 * 提供对应用配置的访问和修改
 */
export function useConfig() {
  const appStore = useAppStore()

  // 配置引用
  const config = computed(() => appStore.config)
  const isLoading = computed(() => appStore.isLoading)

  // 通用配置
  const language = computed(() => config.value?.general.language ?? 'zh-cn')
  const theme = computed(() => config.value?.general.theme ?? 'system')
  const launchAtStartup = computed(() => config.value?.general.launchAtStartup ?? false)
  const showInMenubar = computed(() => config.value?.general.showInMenubar ?? true)
  const showInTray = computed(() => config.value?.general.showInTray ?? true)
  const minimizeToTray = computed(() => config.value?.general.minimizeToTray ?? true)

  // 音频配置
  const audioConfig = computed(() => config.value?.audio)
  const defaultMicrophone = computed(() => config.value?.audio.defaultMicrophone ?? null)
  const defaultSystemSource = computed(() => config.value?.audio.defaultSystemSource ?? null)

  // ASR 配置
  const asrConfig = computed(() => config.value?.asr)
  const asrModelId = computed(() => config.value?.asr.modelId ?? null)
  const asrLanguage = computed(() => config.value?.asr.language ?? 'auto')
  const enablePunctuation = computed(() => config.value?.asr.enablePunctuation ?? true)
  const vadSensitivity = computed(() => config.value?.asr.vadSensitivity ?? 0.5)

  // AI 配置
  const aiConfig = computed(() => config.value?.ai)
  const aiProvider = computed(() => config.value?.ai.provider ?? 'none')

  // 快捷键配置
  const hotkeyConfig = computed(() => config.value?.hotkeys)

  // 存储配置
  const storageConfig = computed(() => config.value?.storage)
  const saveAudioByDefault = computed(() => config.value?.storage.saveAudioByDefault ?? true)

  /**
   * 设置语言
   */
  async function setLanguage(lang: Language): Promise<void> {
    await appStore.updateConfig({
      general: { ...config.value?.general, language: lang } as any,
    })
  }

  /**
   * 设置主题
   */
  async function setTheme(newTheme: Theme): Promise<void> {
    appStore.setTheme(newTheme)
  }

  /**
   * 设置默认麦克风
   */
  async function setDefaultMicrophone(micId: string | null): Promise<void> {
    await appStore.updateConfig({
      audio: { ...config.value?.audio, defaultMicrophone: micId } as any,
    })
  }

  /**
   * 设置默认系统音频源
   */
  async function setDefaultSystemSource(sourceId: string | null): Promise<void> {
    await appStore.updateConfig({
      audio: { ...config.value?.audio, defaultSystemSource: sourceId } as any,
    })
  }

  /**
   * 设置 ASR 模型
   */
  async function setAsrModel(modelId: string): Promise<void> {
    await appStore.updateConfig({
      asr: { ...config.value?.asr, modelId } as any,
    })
  }

  /**
   * 设置 ASR 语言
   */
  async function setAsrLanguage(lang: 'auto' | 'zh' | 'en'): Promise<void> {
    await appStore.updateConfig({
      asr: { ...config.value?.asr, language: lang } as any,
    })
  }

  /**
   * 设置 AI 提供商
   */
  async function setAiProvider(provider: 'none' | 'openai' | 'claude' | 'ollama'): Promise<void> {
    await appStore.updateConfig({
      ai: { ...config.value?.ai, provider } as any,
    })
  }

  /**
   * 更新整个配置
   */
  async function updateConfig(newConfig: Partial<AppConfig>): Promise<void> {
    await appStore.updateConfig(newConfig)
  }

  /**
   * 重新加载配置
   */
  async function reloadConfig(): Promise<void> {
    await appStore.loadConfig()
  }

  return {
    // 配置引用
    config,
    isLoading,
    // 通用配置
    language,
    theme,
    launchAtStartup,
    showInMenubar,
    showInTray,
    minimizeToTray,
    // 音频配置
    audioConfig,
    defaultMicrophone,
    defaultSystemSource,
    // ASR 配置
    asrConfig,
    asrModelId,
    asrLanguage,
    enablePunctuation,
    vadSensitivity,
    // AI 配置
    aiConfig,
    aiProvider,
    // 快捷键配置
    hotkeyConfig,
    // 存储配置
    storageConfig,
    saveAudioByDefault,
    // 方法
    setLanguage,
    setTheme,
    setDefaultMicrophone,
    setDefaultSystemSource,
    setAsrModel,
    setAsrLanguage,
    setAiProvider,
    updateConfig,
    reloadConfig,
  }
}

// ============================================================================
// useAudioConfig Composable
// ============================================================================

/**
 * 音频配置 Hook
 *
 * 专注于音频相关配置
 */
export function useAudioConfig() {
  const { config, updateConfig } = useConfig()

  const audioConfig = computed(() => config.value?.audio)

  /**
   * 更新音频配置
   */
  async function updateAudioConfig(updates: Partial<AudioConfig>): Promise<void> {
    await updateConfig({
      audio: { ...audioConfig.value, ...updates } as any,
    })
  }

  return {
    audioConfig,
    updateAudioConfig,
  }
}

// ============================================================================
// useAsrConfig Composable
// ============================================================================

/**
 * ASR 配置 Hook
 *
 * 专注于 ASR 相关配置，包括 Provider 选择和远端 Provider 配置
 */
export function useAsrConfig() {
  const { config, updateConfig } = useConfig()

  const asrConfig = computed(() => config.value?.asr)

  // Provider 相关
  const asrProvider = computed<AsrProviderType>(() => asrConfig.value?.provider ?? 'local')
  const isLocalProvider = computed(() => asrProvider.value === 'local')
  const isRemoteProvider = computed(() => asrProvider.value !== 'local')

  // 各远端 Provider 的配置
  const openaiWhisperConfig = computed(() => asrConfig.value?.openaiWhisper ?? null)
  const deepgramConfig = computed(() => asrConfig.value?.deepgram ?? null)

  /**
   * 更新 ASR 配置
   */
  async function updateAsrConfig(updates: Partial<AsrConfig>): Promise<void> {
    await updateConfig({
      asr: { ...asrConfig.value, ...updates } as any,
    })
  }

  /**
   * 切换 ASR Provider
   */
  async function setAsrProvider(provider: AsrProviderType): Promise<void> {
    await updateAsrConfig({ provider })
  }

  /**
   * 更新 OpenAI Whisper 配置
   */
  async function updateOpenAiWhisperConfig(
    updates: Partial<OpenAiWhisperConfig>,
  ): Promise<void> {
    const current = openaiWhisperConfig.value ?? {
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'whisper-1',
      language: '',
    }
    await updateAsrConfig({
      openaiWhisper: { ...current, ...updates },
    })
  }

  /**
   * 更新 Deepgram 配置
   */
  async function updateDeepgramConfig(updates: Partial<DeepgramConfig>): Promise<void> {
    const current = deepgramConfig.value ?? {
      apiKey: '',
      baseUrl: 'wss://api.deepgram.com/v1/listen',
      model: 'nova-2',
      language: '',
      smartFormat: true,
      punctuate: true,
      interimResults: true,
    }
    await updateAsrConfig({
      deepgram: { ...current, ...updates },
    })
  }

  return {
    asrConfig,
    // Provider 相关
    asrProvider,
    isLocalProvider,
    isRemoteProvider,
    openaiWhisperConfig,
    deepgramConfig,
    // 方法
    updateAsrConfig,
    setAsrProvider,
    updateOpenAiWhisperConfig,
    updateDeepgramConfig,
  }
}

// ============================================================================
// useAiConfig Composable
// ============================================================================

/**
 * AI 配置 Hook
 *
 * 专注于 AI 相关配置
 */
export function useAiConfig() {
  const { config, updateConfig } = useConfig()

  const aiConfig = computed(() => config.value?.ai)
  const provider = computed(() => aiConfig.value?.provider ?? 'none')

  /**
   * 更新 AI 配置
   */
  async function updateAiConfig(updates: Partial<AiConfig>): Promise<void> {
    await updateConfig({
      ai: { ...aiConfig.value, ...updates } as any,
    })
  }

  return {
    aiConfig,
    provider,
    updateAiConfig,
  }
}

