<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePermissions } from '@/composables/usePermissions'
import MaterialIcon from '@/components/common/MaterialIcon.vue'
import type { PermissionType } from '@/types'

const router = useRouter()
const {
  permissionList,
  allGranted,
  checkAllPermissions,
  requestPermission,
  openSystemSettings,
} = usePermissions()

// 权限配置
const permissionConfig: Record<
  PermissionType,
  { name: string; description: string; iconName: string }
> = {
  ScreenCapture: {
    name: 'System Audio',
    description: 'Capture audio from other apps.',
    iconName: 'speaker_group',
  },
  Microphone: {
    name: 'Microphone',
    description: 'Required for voice transcription.',
    iconName: 'mic',
  },
  Accessibility: {
    name: 'Accessibility',
    description: 'For keyboard shortcuts and hotkeys.',
    iconName: 'keyboard_command_key',
  },
}

const requestingPermission = ref<PermissionType | null>(null)

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

function continueNext() {
  router.push('/onboarding/model')
}

onMounted(async () => {
  await checkAllPermissions()
})
</script>

<template>
  <div class="w-full max-w-[520px] flex flex-col items-center gap-8 px-6">
    <!-- Logo -->
    <div
      class="size-12 rounded-xl flex items-center justify-center"
      style="background-color: var(--la-accent)"
    >
      <MaterialIcon name="mic" size="lg" style="color: var(--la-text-inverted)" />
    </div>

    <!-- 标题 -->
    <div class="text-center">
      <h1 class="text-[28px] font-bold mb-2" style="color: var(--la-text-primary)">
        System Permissions
      </h1>
      <p class="text-sm" style="color: var(--la-text-secondary)">
        LazyAudio needs these permissions to work properly.
      </p>
    </div>

    <!-- 权限卡片列表 -->
    <div class="w-full flex flex-col gap-3">
      <div
        v-for="perm in permissionList"
        :key="perm.type"
        class="flex items-center gap-3 p-4 rounded-[10px]"
        style="background-color: var(--la-bg-surface)"
      >
        <!-- 图标 -->
        <div
          class="size-9 rounded-lg flex items-center justify-center shrink-0"
          style="background-color: var(--la-bg-inset); color: var(--la-text-secondary)"
        >
          <MaterialIcon :name="permissionConfig[perm.type]?.iconName || 'shield'" size="sm" />
        </div>

        <!-- 文字 -->
        <div class="flex-1 min-w-0">
          <h3 class="text-sm font-semibold" style="color: var(--la-text-primary)">
            {{ permissionConfig[perm.type]?.name || perm.type }}
          </h3>
          <p class="text-xs" style="color: var(--la-text-tertiary)">
            {{ permissionConfig[perm.type]?.description }}
          </p>
        </div>

        <!-- 操作 -->
        <template v-if="perm.status === 'Granted'">
          <span
            class="flex items-center gap-1.5 px-3 py-1 rounded-md border text-xs font-medium"
            style="border-color: var(--la-tier2-green); color: var(--la-tier2-green)"
          >
            <MaterialIcon name="check" size="sm" />
            Granted
          </span>
        </template>
        <button
          v-else
          class="px-4 py-1.5 rounded-md text-xs font-semibold transition-opacity shrink-0"
          style="background-color: var(--la-accent); color: var(--la-text-inverted)"
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
            {{ perm.status === 'NotDetermined' ? 'Grant' : 'Settings' }}
          </template>
        </button>
      </div>
    </div>

    <!-- 继续按钮 -->
    <button
      class="w-full max-w-[320px] py-3 rounded-md text-sm font-semibold transition-opacity"
      :style="
        allGranted
          ? { backgroundColor: 'var(--la-accent)', color: 'var(--la-text-inverted)' }
          : { backgroundColor: 'var(--la-bg-surface)', color: 'var(--la-text-muted)', cursor: 'not-allowed', opacity: '0.5' }
      "
      :disabled="!allGranted"
      @click="continueNext"
    >
      Continue
    </button>

    <!-- 步骤指示器 -->
    <div class="flex items-center gap-2">
      <span class="size-2 rounded-full" style="background-color: var(--la-accent)" />
      <span class="size-2 rounded-full" style="background-color: var(--la-border)" />
    </div>
  </div>
</template>
