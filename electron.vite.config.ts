import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
        },
      },
    },
    resolve: {
      alias: { '@shared': resolve('shared') },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
        },
      },
    },
    resolve: {
      alias: { '@shared': resolve('shared') },
    },
  },
  renderer: {
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          main: resolve('src/renderer/main.html'),
          prep: resolve('src/renderer/prep.html'),
          onboarding: resolve('src/renderer/onboarding.html'),
          settings: resolve('src/renderer/settings.html'),
        },
      },
    },
    resolve: {
      alias: {
        '@': resolve('src/renderer'),
        '@shared': resolve('shared'),
      },
    },
  },
})
