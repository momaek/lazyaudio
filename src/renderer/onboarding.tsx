import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initI18n } from './i18n'
import { App } from './windows/onboarding/App'

const container = document.getElementById('root')
if (!container) throw new Error('#root not found')

void initI18n().then(() => {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
