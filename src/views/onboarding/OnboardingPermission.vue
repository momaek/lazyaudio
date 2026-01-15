<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePermissions } from '@/composables/usePermissions'
import MaterialIcon from '@/components/common/MaterialIcon.vue'
import { Button } from '@/components/ui/button'
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
  iconName: string
}> = {
  ScreenCapture: {
    name: 'System Audio',
    description: 'Capture and route audio from other desktop applications.',
    iconName: 'speaker_group',
  },
  Microphone: {
    name: 'Microphone Access',
    description: 'Required for voice commands and live transcription.',
    iconName: 'mic',
  },
  Accessibility: {
    name: 'Accessibility',
    description: 'Used for keyboard simulation and global hotkey management.',
    iconName: 'keyboard_command_key',
  },
}

// 请求权限中的状态
const requestingPermission = ref<PermissionType | null>(null)

// 获取状态标签
function getStatusBadge(status: string | undefined) {
  switch (status) {
    case 'Granted':
      return {
        text: 'AUTHORIZED',
        class: 'bg-primary-bright/10 text-primary-bright border-primary-bright/20',
        dotClass: 'bg-primary-bright'
      }
    case 'Denied':
      return {
        text: 'DENIED',
        class: 'bg-zinc-800 text-zinc-400 border-zinc-700',
        dotClass: 'bg-red-500/60'
      }
    default:
      return {
        text: 'REQUIRED',
        class: 'bg-zinc-800 text-zinc-400 border-zinc-700',
        dotClass: 'bg-amber-500/60'
      }
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

// 初始化
onMounted(async () => {
  await checkAllPermissions()
})
</script>

<template>
  <div class="min-h-screen flex flex-col font-display selection:bg-primary-bright/30 bg-background-dark-ink text-white">
    <!-- 顶部导航 -->
    <header class="flex items-center justify-between border-b border-border-dark-ink px-8 py-5 bg-background-dark-ink/80 backdrop-blur-md sticky top-0 z-50">
      <div class="flex items-center gap-3">
        <div class="size-8 bg-primary-bright rounded-lg flex items-center justify-center text-background-dark">
          <MaterialIcon name="graphic_eq" size="lg" weight="700" />
        </div>
        <h2 class="text-lg font-bold tracking-tight text-white">LazyAudio</h2>
      </div>
      <div class="flex items-center gap-6">
        <div class="flex flex-col items-end">
          <span class="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold">Setup Phase</span>
          <span class="text-xs font-medium text-primary-bright">01 / 04 Permissions</span>
        </div>
        <div class="size-9 rounded-full border border-primary-bright/20 p-0.5">
          <div class="w-full h-full rounded-full bg-zinc-700" />
        </div>
      </div>
    </header>

    <!-- 主内容 -->
    <main class="flex-1 flex items-center justify-center p-6 py-16">
      <div class="max-w-[640px] w-full flex flex-col items-center">
        <!-- 标题 -->
        <div class="text-center mb-12">
          <h1 class="text-4xl md:text-5xl font-bold tracking-tight mb-4 text-white">
            System Permissions
          </h1>
          <p class="text-zinc-400 text-lg max-w-md mx-auto leading-relaxed">
            To orchestrate your audio workflow, LazyAudio requires specific system-level access.
          </p>
        </div>

        <!-- 权限卡片 -->
        <div class="w-full space-y-3">
          <div
            v-for="perm in permissionList"
            :key="perm.type"
            class="group relative flex items-center gap-5 p-5 bg-surface-dark-ink border border-border-dark-ink rounded-xl transition-all hover:border-primary-bright/30"
          >
            <!-- 图标 -->
            <div class="size-12 bg-zinc-900 rounded-lg flex items-center justify-center text-zinc-400 group-hover:text-primary-bright transition-colors">
              <MaterialIcon :name="permissionConfig[perm.type]?.iconName || 'shield'" size="lg" />
            </div>

            <!-- 内容 -->
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-1">
                <h3 class="text-base font-semibold text-zinc-100">
                  {{ permissionConfig[perm.type]?.name || perm.type }}
                </h3>
                <span 
                  class="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border"
                  :class="getStatusBadge(perm.status).class"
                >
                  <span 
                    class="status-dot"
                    :class="getStatusBadge(perm.status).dotClass"
                  />
                  {{ getStatusBadge(perm.status).text }}
                </span>
              </div>
              <p class="text-sm text-zinc-500 leading-relaxed max-w-sm">
                {{ permissionConfig[perm.type]?.description }}
              </p>
            </div>

            <!-- 操作按钮 -->
            <div v-if="perm.status === 'Granted'" class="size-10 flex items-center justify-center text-primary-bright">
              <MaterialIcon name="check_circle" size="lg" />
            </div>
            <button
              v-else
              class="px-5 py-2 font-bold text-sm rounded-lg transition-all active:scale-95"
              :class="[
                perm.status === 'NotDetermined'
                  ? 'bg-primary-bright text-black hover:brightness-110 shadow-lg shadow-primary-bright/10'
                  : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700 border border-zinc-700'
              ]"
              :disabled="requestingPermission === perm.type"
              @click="handleRequestPermission(perm.type)"
            >
              <MaterialIcon 
                v-if="requestingPermission === perm.type"
                name="progress_activity" 
                size="sm"
                class="animate-spin"
              />
              <template v-else>
                {{ perm.status === 'NotDetermined' ? 'Grant' : 'Open Settings' }}
              </template>
            </button>
          </div>
        </div>

        <!-- 底部操作 -->
        <div class="mt-14 w-full flex flex-col items-center gap-5">
          <button
            class="w-full max-w-[320px] py-4 font-bold rounded-xl transition-all border"
            :class="[
              allGranted 
                ? 'bg-primary-bright text-black hover:brightness-110 border-transparent shadow-lg shadow-primary-bright/20'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border-border-dark-ink opacity-50'
            ]"
            :disabled="!allGranted"
            @click="continueNext"
          >
            Continue to Workspace
          </button>
          
          <div class="flex items-center gap-4 text-xs font-medium uppercase tracking-widest text-zinc-500">
            <span class="flex items-center gap-1.5">
              <MaterialIcon name="settings" size="sm" />
              System Preferences
            </span>
            <span class="h-3 w-px bg-zinc-800" />
            <a class="text-primary-bright hover:text-primary-bright/80 transition-colors" href="#">
              Support Guide
            </a>
          </div>
        </div>
      </div>
    </main>

    <!-- 背景光晕 -->
    <div class="fixed top-0 right-0 -z-10 w-[600px] h-[600px] bg-primary-bright/5 blur-[140px] rounded-full pointer-events-none" />
    <div class="fixed bottom-0 left-0 -z-10 w-[500px] h-[500px] bg-primary-bright/5 blur-[120px] rounded-full pointer-events-none" />
  </div>
</template>

<style scoped>
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
</style>
