import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initI18n } from './i18n'
import { initTheme } from './theme'
import { App } from './windows/main/App'

const container = document.getElementById('root')
if (!container) throw new Error('#root not found')

initTheme() // T58:开窗即应用主题(React mount 前,避免闪)

// i18n 资源是 inline JSON,init 在同一微任务内完成,等它再 mount 避免首次渲染 fallback key。
void initI18n().then(() => {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
