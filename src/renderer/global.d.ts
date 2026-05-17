/// <reference types="vite/client" />

import type { LazyAudioApi } from '@shared/types/api'

declare global {
  interface Window {
    lazyaudio: LazyAudioApi
  }
}

export {}
