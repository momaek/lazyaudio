<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const router = useRouter()
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-lg font-semibold mb-4">AI 设置</h2>
      <Separator class="mb-6" />
    </div>

    <!-- 语音识别模型 -->
    <Card>
      <CardHeader>
        <CardTitle class="text-base">语音识别模型</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <p class="text-sm text-muted-foreground">下载语音识别模型以启用实时转录功能</p>
        <Button @click="router.push('/onboarding/model')"> 管理模型 </Button>
      </CardContent>
    </Card>

    <p class="text-muted-foreground text-sm">更多 AI 设置功能开发中...</p>
  </div>
</template>
