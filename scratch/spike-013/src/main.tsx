import { createRoot } from 'react-dom/client'
import { App } from './App'
import './style.css'

// 故意不开 StrictMode:spike 量真实 mount/unmount,
// StrictMode dev 模式会双触发 effect 干扰数字。
createRoot(document.getElementById('root')!).render(<App />)
