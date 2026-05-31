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
          // T30 — ASR utility process 入口(ADR-0003)。与 index.js 同目录(out/main/asr.js),
          // 主进程 utilityProcess.fork(__dirname/asr.js) 路径在 dev / packaged 都稳定。
          asr: resolve('src/main/workers/asr/index.ts'),
          // T34 — Pass A 实时转录 utility 入口(VAD + SenseVoice 短窗)。同上,out/main/streaming-asr.js。
          'streaming-asr': resolve('src/main/workers/streaming-asr/index.ts'),
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
          capture: resolve('src/renderer/capture.html'),
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
