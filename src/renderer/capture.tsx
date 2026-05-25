import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './windows/capture/App'

// capture window 是 headless 的:不需要 i18n / 不显示 UI;只挂 lifecycle hook
// 用 React 是为了和其他 window 风格一致,实际逻辑都在 useEffect 里。
const container = document.getElementById('root')
if (!container) throw new Error('#root not found')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
