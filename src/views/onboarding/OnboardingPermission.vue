<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePermissions } from '@/composables/usePermissions'
import { Shield, Mic, Monitor, CheckCircle2, XCircle, AlertCircle, ExternalLink, Loader2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import type { PermissionType } from '@/types'

const router = useRouter()
const {
  permissionList,
  isLoading,
  allGranted,
  checkAllPermissions,
  requestPermission,
  openSystemSettings,
} = usePermissions()

// 权限配置
const permissionConfig: Record<PermissionType, {
  name: string
  description: string
  icon: typeof Shield
}> = {
  ScreenCapture: {
    name: '屏幕录制',
    description: '用于采集系统音频（macOS 需要此权限）',
    icon: Monitor,
  },
  Microphone: {
    name: '麦克风',
    description: '用于采集麦克风音频',
    icon: Mic,
  },
  Accessibility: {
    name: '辅助功能',
    description: '用于输入法模式的键盘模拟（可选）',
    icon: Shield,
  },
}

// 请求权限中的状态
const requestingPermission = ref<PermissionType | null>(null)

// 获取权限状态图标
function getStatusIcon(status: string | undefined) {
  switch (status) {
    case 'Granted':
      return CheckCircle2
    case 'Denied':
      return XCircle
    default:
      return AlertCircle
  }
}

// 获取状态颜色
function getStatusColor(status: string | undefined) {
  switch (status) {
    case 'Granted':
      return 'text-la-success'
    case 'Denied':
      return 'text-destructive'
    default:
      return 'text-la-warning'
  }
}

// 请求权限
async function handleRequestPermission(type: PermissionType) {
  requestingPermission.value = type
  try {
    const granted = await requestPermission(type)
    if (!granted) {
      await openSystemSettings(type)
    }
    await checkAllPermissions()
  } finally {
    requestingPermission.value = null
  }
}

// 继续下一步
function continueNext() {
  router.push('/onboarding/model')
}

// 跳过当前步骤
function skipStep() {
  router.push('/onboarding/model')
}

// 初始化
onMounted(async () => {
  await checkAllPermissions()
})
</script>

<template>
  <div class="relative min-h-screen flex flex-col items-center justify-center p-8">
    <!-- 标题 -->
    <div class="text-center mb-8">
      <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl la-gradient mb-4 shadow-lg shadow-la-indigo/20">
        <Shield class="w-8 h-8 text-white" />
      </div>
      <h1 class="text-2xl font-bold mb-2">权限设置</h1>
      <p class="text-muted-foreground">
        LazyAudio 需要以下权限才能正常工作
      </p>
    </div>

    <!-- 权限卡片 -->
    <div class="w-full max-w-md space-y-3 mb-8">
      <Card
        v-for="perm in permissionList"
        :key="perm.type"
        class="bg-card/50 border-border/50 backdrop-blur-sm transition-all duration-200"
        :class="{ 
          'border-la-success/30 bg-la-success/5': perm.status === 'Granted',
          'hover:border-border': perm.status !== 'Granted'
        }"
      >
        <CardHeader class="pb-2">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-secondary">
                <component
                  :is="permissionConfig[perm.type]?.icon || Shield"
                  class="w-5 h-5 text-la-indigo"
                />
              </div>
              <div>
                <CardTitle class="text-base">
                  {{ permissionConfig[perm.type]?.name || perm.type }}
                </CardTitle>
                <CardDescription class="text-xs">
                  {{ permissionConfig[perm.type]?.description }}
                </CardDescription>
              </div>
            </div>
            <component
              :is="getStatusIcon(perm.status)"
              :class="['w-5 h-5', getStatusColor(perm.status)]"
            />
          </div>
        </CardHeader>
        <CardContent v-if="perm.status !== 'Granted'">
          <Button
            size="sm"
            variant="secondary"
            class="w-full gap-2"
            :disabled="requestingPermission === perm.type"
            @click="handleRequestPermission(perm.type)"
          >
            <Loader2
              v-if="requestingPermission === perm.type"
              class="w-4 h-4 animate-spin"
            />
            <ExternalLink v-else class="w-4 h-4" />
            {{ perm.status === 'NotDetermined' ? '授权' : '前往设置' }}
          </Button>
        </CardContent>
      </Card>
    </div>

    <!-- 操作按钮 -->
    <div class="flex flex-col items-center gap-3">
      <Button
        size="lg"
        class="px-8"
        :disabled="!allGranted && !isLoading"
        @click="continueNext"
      >
        {{ allGranted ? '继续' : '请先授权必要权限' }}
      </Button>
      
      <!-- 跳过按钮 -->
      <Button
        variant="ghost"
        size="sm"
        class="text-muted-foreground hover:text-foreground"
        @click="skipStep"
      >
        跳过此步骤
      </Button>
    </div>

    <!-- 提示 -->
    <p class="mt-4 text-xs text-muted-foreground text-center max-w-sm">
      跳过后部分功能可能无法正常使用，你可以稍后在设置中授权
    </p>
  </div>
</template>
