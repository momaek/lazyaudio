<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { commands } from '@/types'
import type { AllPermissionsStatus, PermissionType, PermissionStatus } from '@/types'

// Props
const props = defineProps<{
  onComplete?: () => void
}>()

// 权限状态
const permissions = ref<AllPermissionsStatus | null>(null)
const isChecking = ref(false)

// 权限配置
interface PermissionConfig {
  type: PermissionType
  name: string
  description: string
  icon: string
  required: boolean
  canRequest: boolean
}

const permissionConfigs: PermissionConfig[] = [
  {
    type: 'systemAudioRecording',
    name: '系统音频录制',
    description: '用于捕获系统音频，可在设置中选择「仅录音」选项',
    icon: '🔊',
    required: true,
    canRequest: true,  // 可以触发系统权限请求对话框
  },
  {
    type: 'microphone',
    name: '麦克风',
    description: '用于录制麦克风音频，可直接请求授权',
    icon: '🎤',
    required: true,
    canRequest: true,
  },
  {
    type: 'accessibility',
    name: '辅助功能',
    description: '用于全局快捷键和输入法模式（可选）',
    icon: '⌨️',
    required: false,
    canRequest: false,  // 辅助功能只能在系统设置中手动授权
  },
]

// 获取权限状态
function getPermissionStatus(type: PermissionType): PermissionStatus {
  if (!permissions.value) return 'notDetermined'
  switch (type) {
    case 'systemAudioRecording':
      return permissions.value.systemAudioRecording
    case 'microphone':
      return permissions.value.microphone
    case 'accessibility':
      return permissions.value.accessibility
    default:
      return 'notDetermined'
  }
}

// 检查权限是否已授权
function isPermissionGranted(type: PermissionType): boolean {
  const status = getPermissionStatus(type)
  return status === 'granted' || status === 'notApplicable'
}

// 状态显示
function getStatusDisplay(status: PermissionStatus): { text: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
  switch (status) {
    case 'granted':
      return { text: '已授权', variant: 'default' }
    case 'denied':
      // macOS 无法区分"未请求"和"已拒绝"，统一显示为"未授权"
      return { text: '未授权', variant: 'secondary' }
    case 'notDetermined':
      return { text: '待授权', variant: 'secondary' }
    case 'restricted':
      return { text: '受限', variant: 'destructive' }
    case 'notApplicable':
      return { text: '无需授权', variant: 'outline' }
    default:
      return { text: '未知', variant: 'secondary' }
  }
}

// 状态图标
function getStatusIcon(status: PermissionStatus): string {
  switch (status) {
    case 'granted':
    case 'notApplicable':
      return '✓'
    case 'restricted':
      return '✗'
    case 'denied':
    case 'notDetermined':
      return '○'  // 空心圆表示待授权
    default:
      return '?'
  }
}

// 检查所有权限
async function checkAllPermissions() {
  isChecking.value = true
  try {
    permissions.value = await commands.checkAllPermissions()
  } catch (error) {
    console.error('检查权限失败:', error)
  } finally {
    isChecking.value = false
  }
}

// 打开系统设置
async function openSettings(type: PermissionType) {
  try {
    const result = await commands.openPermissionSettings(type)
    if (result.status === 'error') {
      console.error('打开设置失败:', result.error)
    }
  } catch (error) {
    console.error('打开设置异常:', error)
  }
}

// 是否所有必需权限都已授权
const allRequiredGranted = computed(() => {
  return permissions.value?.allRequiredGranted ?? false
})

// 继续按钮点击
function handleContinue() {
  props.onComplete?.()
}

// 初始化
onMounted(() => {
  checkAllPermissions()
})
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-8">
    <div class="w-full max-w-2xl">
      <!-- 标题区域 -->
      <div class="text-center mb-10">
        <div class="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 mb-6 shadow-lg shadow-cyan-500/25">
          <span class="text-4xl">🎙️</span>
        </div>
        <h1 class="text-4xl font-bold text-white mb-3 tracking-tight font-['DM_Sans',system-ui,sans-serif]">
          LazyAudio
        </h1>
        <p class="text-slate-400 text-lg">
          为了提供最佳体验，我们需要以下系统权限
        </p>
      </div>

      <!-- 权限卡片列表 -->
      <div class="space-y-4 mb-8">
        <Card
          v-for="config in permissionConfigs"
          :key="config.type"
          class="bg-slate-900/50 border-slate-800 backdrop-blur-sm transition-all hover:border-slate-700"
        >
          <CardHeader class="pb-3">
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-4">
                <div class="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-2xl">
                  {{ config.icon }}
                </div>
                <div>
                  <CardTitle class="text-white text-lg flex items-center gap-2">
                    {{ config.name }}
                    <Badge
                      v-if="config.required"
                      variant="outline"
                      class="text-xs border-cyan-500/50 text-cyan-400"
                    >
                      必需
                    </Badge>
                    <Badge
                      v-else
                      variant="outline"
                      class="text-xs border-slate-600 text-slate-400"
                    >
                      可选
                    </Badge>
                  </CardTitle>
                  <CardDescription class="text-slate-400 mt-1">
                    {{ config.description }}
                  </CardDescription>
                </div>
              </div>
              <!-- 状态徽章 -->
              <Badge
                :variant="getStatusDisplay(getPermissionStatus(config.type)).variant"
                class="shrink-0"
              >
                <span class="mr-1">{{ getStatusIcon(getPermissionStatus(config.type)) }}</span>
                {{ getStatusDisplay(getPermissionStatus(config.type)).text }}
              </Badge>
            </div>
          </CardHeader>
          <CardContent class="pt-0">
            <div class="flex gap-2 justify-end items-center">
              <!-- 提示文字：被拒绝后需要去设置中开启 -->
              <span
                v-if="!isPermissionGranted(config.type)"
                class="text-xs text-slate-500 mr-2"
              >
                请在系统设置中授权
              </span>
              <!-- 打开设置按钮（未授权时显示） -->
              <Button
                v-if="!isPermissionGranted(config.type)"
                size="sm"
                class="bg-cyan-600 hover:bg-cyan-500"
                @click="openSettings(config.type)"
              >
                打开设置
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- 底部操作区 -->
      <div class="flex items-center justify-between">
        <Button
          variant="ghost"
          class="text-slate-400 hover:text-white hover:bg-slate-800"
          :disabled="isChecking"
          @click="checkAllPermissions"
        >
          <span class="mr-2" :class="{ 'animate-spin': isChecking }">🔄</span>
          刷新状态
        </Button>

        <div class="flex gap-2">
          <!-- 开发模式：跳过按钮 -->
          <Button
            v-if="!allRequiredGranted"
            variant="outline"
            class="border-slate-700 text-slate-400 hover:bg-slate-800"
            @click="handleContinue"
          >
            暂时跳过
          </Button>
          <Button
            :disabled="!allRequiredGranted"
            class="px-8 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
            @click="handleContinue"
          >
            {{ allRequiredGranted ? '继续使用' : '请先授权必需权限' }}
          </Button>
        </div>
      </div>

      <!-- 提示信息 -->
      <p class="text-center text-slate-500 text-sm mt-6">
        您可以稍后在设置中修改权限配置
      </p>
    </div>
  </div>
</template>

<style scoped>
/* 自定义动画 */
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.animate-spin {
  animation: spin 1s linear infinite;
  display: inline-block;
}
</style>
