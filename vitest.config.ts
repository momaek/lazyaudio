import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/renderer/**/*.test.{ts,tsx}'],
    // tests/e2e/ 由 playwright 跑(T19+ 引入),vitest 不碰
    exclude: ['node_modules', 'out', 'dist', '.vite', 'scratch/**'],
    reporters: process.env['CI'] ? ['default', 'github-actions'] : ['default'],
  },
  resolve: {
    alias: {
      '@shared': resolve('shared'),
      '@': resolve('src/renderer'),
    },
  },
})
