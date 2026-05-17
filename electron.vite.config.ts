import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

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
        // sandbox: true 下 Electron 的 preload 不支持 ESM,必须 CJS
        output: { format: 'cjs', entryFileNames: '[name].js' },
      },
    },
    resolve: {
      alias: { '@shared': resolve('shared') },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          main: resolve('src/renderer/main.html'),
          prep: resolve('src/renderer/prep.html'),
          onboarding: resolve('src/renderer/onboarding.html'),
          settings: resolve('src/renderer/settings.html'),
          showcase: resolve('src/renderer/showcase.html'),
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
