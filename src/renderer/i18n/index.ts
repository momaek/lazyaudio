// i18n 入口 — 每个 renderer entry mount 前调一次 initI18n()。
// v0.1 只有 zh-CN;namespace 切分见 src/renderer/i18n/locales/zh-CN/*.json。
// 错误文案统一走 errors namespace;UI 文案走 common(+ 各 window/feature 自带 namespace,后续 T 添加)。
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

import zhCNCommon from './locales/zh-CN/common.json'
import zhCNErrors from './locales/zh-CN/errors.json'

let initialized = false

export async function initI18n(): Promise<void> {
  if (initialized) return
  initialized = true
  await i18next.use(initReactI18next).init({
    lng: 'zh-CN',
    fallbackLng: 'zh-CN',
    ns: ['common', 'errors'],
    defaultNS: 'common',
    resources: {
      'zh-CN': {
        common: zhCNCommon,
        errors: zhCNErrors,
      },
    },
    interpolation: {
      escapeValue: false, // React 已自动 escape
    },
    returnNull: false,
    // react-i18next 默认 useSuspense: true,没 Suspense boundary 会静默挂掉首次渲染。
    // v0.1 不引 Suspense(没有按需 namespace 加载,resources 全 inline),关掉 suspense。
    react: { useSuspense: false },
  })
}

export { default as i18n } from 'i18next'
