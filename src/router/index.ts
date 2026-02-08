import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { setupGuards } from './guards'

/**
 * 路由配置
 * 
 * 路由结构:
 * /onboarding              - 引导流程
 *   /onboarding/permission - 权限步骤
 *   /onboarding/model      - 模型下载步骤
 * /                        - 主应用 (DefaultLayout)
 *   /home                  - 主页
 *   /mode/:modeId          - Mode 视图
 *   /settings              - 设置
 *   /history               - 历史记录
 *   /history/:sessionId    - Session 详情
 * /floating                - 悬浮窗布局
 *   /floating/interviewee  - 面试者悬浮窗
 *   /floating/input-method - 输入法悬浮窗
 */

const routes: RouteRecordRaw[] = [
  // 引导流程
  {
    path: '/onboarding',
    component: () => import('@/layouts/OnboardingLayout.vue'),
    children: [
      {
        path: '',
        name: 'onboarding',
        redirect: '/onboarding/permission',
      },
      {
        path: 'permission',
        name: 'onboarding-permission',
        component: () => import('@/views/onboarding/OnboardingPermission.vue'),
        meta: { title: '权限设置' },
      },
      {
        path: 'asr',
        name: 'onboarding-asr',
        component: () => import('@/views/onboarding/OnboardingAsr.vue'),
        meta: { title: '语音识别配置' },
      },
      {
        // 保留旧路由兼容
        path: 'model',
        redirect: '/onboarding/asr',
      },
    ],
  },

  // 主应用
  {
    path: '/',
    component: () => import('@/layouts/DefaultLayout.vue'),
    children: [
      {
        path: '',
        name: 'root',
        redirect: '/home',
      },
      {
        path: 'home',
        name: 'home',
        component: () => import('@/views/home/HomeView.vue'),
        meta: { title: '首页' },
      },
      {
        path: 'mode/:modeId',
        name: 'mode',
        component: () => import('@/views/mode/ModeView.vue'),
        meta: { title: '模式' },
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('@/views/settings/SettingsView.vue'),
        meta: { title: '设置' },
      },
      {
        path: 'history',
        name: 'history',
        component: () => import('@/views/history/HistoryView.vue'),
        meta: { title: '历史记录' },
      },
      {
        path: 'history/:sessionId',
        name: 'history-detail',
        component: () => import('@/views/history/HistoryDetailView.vue'),
        meta: { title: '记录详情' },
      },
      // 开发测试页面
      {
        path: 'dev/audio-test',
        name: 'audio-test',
        component: () => import('@/views/test/AudioTest.vue'),
        meta: { title: '音频测试' },
      },
    ],
  },

  // 悬浮窗
  {
    path: '/floating',
    component: () => import('@/layouts/FloatingLayout.vue'),
    children: [
      {
        path: 'interviewee',
        name: 'floating-interviewee',
        component: () => import('@/views/floating/FloatingInterviewee.vue'),
        meta: { title: '面试助手' },
      },
      {
        path: 'input-method',
        name: 'floating-input-method',
        component: () => import('@/views/floating/FloatingInputMethod.vue'),
        meta: { title: '语音输入' },
      },
    ],
  },

  // 404
  {
    path: '/:pathMatch(.*)*',
    redirect: '/home',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// 设置导航守卫
setupGuards(router)

export default router

