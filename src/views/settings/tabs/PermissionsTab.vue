<script setup lang="ts">
import { onMounted } from 'vue'
import MaterialIcon from '@/components/common/MaterialIcon.vue'
import SectionLabel from '@/components/common/SectionLabel.vue'
import { usePermissions } from '@/composables/usePermissions'
import type { PermissionType } from '@/types'

const {
  permissionList,
  isLoading,
  allGranted,
  checkAllPermissions,
  requestPermission,
  openSystemSettings,
} = usePermissions()

// 权限描述映射
const permissionMeta: Record<string, { label: string; description: string; icon: string }> = {
  ScreenCapture: {
    label: '屏幕录制 / 系统音频',
    description: '需要此权限才能采集系统音频',
    icon: 'desktop_windows',
  },
  Microphone: {
    label: '麦克风',
    description: '需要此权限才能采集麦克风音频',
    icon: 'mic',
  },
  Accessibility: {
    label: '辅助功能',
    description: '输入法模式需要此权限来模拟键盘输入',
    icon: 'accessibility',
  },
}

function getStatusColor(status: string | undefined): string {
  if (status === 'Granted' || status === 'NotApplicable') return 'var(--la-tier2-green)'
  if (status === 'Denied') return 'var(--la-recording-red)'
  return 'var(--la-text-tertiary)'
}

function getStatusLabel(status: string | undefined) {
  if (status === 'Granted') return '已授权'
  if (status === 'NotApplicable') return '不适用'
  if (status === 'Denied') return '已拒绝'
  if (status === 'NotDetermined') return '未请求'
  return '未知'
}

async function handleRequest(type: PermissionType) {
  await requestPermission(type)
}

async function handleOpenSettings(type: PermissionType) {
  await openSystemSettings(type)
}

onMounted(() => {
  checkAllPermissions()
})
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-lg font-semibold mb-1" style="color: var(--la-text-primary)">权限设置</h2>
      <p class="text-sm" style="color: var(--la-text-tertiary)">管理应用所需的系统权限</p>
    </div>

    <!-- 总体状态 -->
    <div
      class="p-3 rounded-lg flex items-center gap-3"
      :style="{
        backgroundColor: allGranted
          ? 'color-mix(in srgb, var(--la-tier2-green) 10%, transparent)'
          : 'color-mix(in srgb, var(--la-accent) 10%, transparent)',
      }"
    >
      <MaterialIcon
        :name="allGranted ? 'check_circle' : 'info'"
        size="sm"
        :style="{ color: allGranted ? 'var(--la-tier2-green)' : 'var(--la-accent)' }"
        class="shrink-0"
      />
      <span class="text-sm" style="color: var(--la-text-primary)">
        {{ allGranted ? '所有必需权限已授予' : '部分权限尚未授予，可能影响功能使用' }}
      </span>
    </div>

    <!-- 权限列表 -->
    <div class="rounded-[10px] p-5" style="background-color: var(--la-bg-surface)">
      <SectionLabel label="System Permissions" class="mb-4 block" />
      <div class="space-y-3">
        <div
          v-for="perm in permissionList"
          :key="perm.type"
          class="flex items-center justify-between py-3 border-b last:border-0"
          style="border-color: var(--la-divider)"
        >
          <div class="flex items-start gap-3">
            <div
              class="size-8 rounded-lg flex items-center justify-center shrink-0"
              style="background-color: var(--la-bg-inset)"
            >
              <MaterialIcon
                :name="permissionMeta[perm.type]?.icon ?? 'security'"
                size="sm"
                style="color: var(--la-text-secondary)"
              />
            </div>
            <div>
              <h3 class="text-sm font-medium" style="color: var(--la-text-primary)">
                {{ permissionMeta[perm.type]?.label ?? perm.type }}
              </h3>
              <p class="text-xs mt-0.5" style="color: var(--la-text-tertiary)">
                {{ permissionMeta[perm.type]?.description }}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span
              class="text-xs font-medium px-2 py-0.5 rounded border"
              :style="{
                color: getStatusColor(perm.status),
                borderColor: getStatusColor(perm.status),
              }"
            >
              {{ getStatusLabel(perm.status) }}
            </span>
            <button
              v-if="perm.status === 'Denied' || perm.status === 'NotDetermined'"
              class="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
              style="background-color: var(--la-bg-inset); color: var(--la-text-secondary)"
              @click="
                perm.status === 'Denied'
                  ? handleOpenSettings(perm.type)
                  : handleRequest(perm.type)
              "
            >
              <MaterialIcon name="open_in_new" size="sm" />
              {{ perm.status === 'Denied' ? '打开设置' : '请求权限' }}
            </button>
          </div>
        </div>

        <button
          class="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors mt-2"
          style="background-color: var(--la-bg-inset); color: var(--la-text-secondary)"
          :disabled="isLoading"
          @click="checkAllPermissions"
        >
          刷新权限状态
        </button>
      </div>
    </div>
  </div>
</template>
