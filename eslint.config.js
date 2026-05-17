// LazyAudio ESLint 9 flat config
// 模块边界 / IPC / i18n 等专项规则将随对应里程碑接入(coding-conventions.md §6 / §10)
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import i18next from 'eslint-plugin-i18next'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  {
    ignores: [
      'out/**',
      'dist/**',
      'node_modules/**',
      '.local-userdata/**',
      '.vite/**',
      'scratch/**', // spike POC 代码,不走 lint(scratch/README 已声明非生产)
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // 通用 TS
  {
    files: ['**/*.{ts,tsx,cts,mts}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },

  // Renderer (React + i18n)
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { react, 'react-hooks': reactHooks, i18next },
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off', // React 17+ 自动 JSX
      'react/prop-types': 'off',
      // i18n:user-visible 中英文字面量必须走 t() — warn 不 error(CI 不 block),
      // dev-plan T05 约定先 warn 培养习惯,v0.x 严控。
      // 用 `// i18n-allow` 行内豁免,或加 callees: 来声明哪些函数允许带字面参数。
      'i18next/no-literal-string': [
        'warn',
        {
          mode: 'jsx-text-only',
          'should-validate-template': false,
          words: {
            exclude: [
              // 短英文 / 标点 / 数字字母 / 仅符号 — 这类不需要 i18n
              '^[\\s.,:;!?\\-_=+\\d]+$',
            ],
          },
          'jsx-attributes': {
            // 不需要 i18n 的属性(技术属性 / 由 t() 间接喂的)
            exclude: [
              'aria-label',
              'aria-labelledby',
              'aria-describedby',
              'aria-valuetext',
              'data-testid',
              'title',
              'type',
              'role',
              'placeholder',
              'autoComplete',
              'name',
              'id',
              'href',
              'src',
              'alt',
              'rel',
              'target',
              'key',
              'className',
              'style',
            ],
          },
        },
      ],
    },
  },
  // i18n 配置 / 测试 / dev-only showcase:不做 no-literal-string 兜底
  // showcase 是设计系统 dev demo,不上生产,字面量是规格描述本身,迁 t() 没意义
  {
    files: [
      'src/renderer/i18n/**/*.ts',
      'src/renderer/global.d.ts',
      'src/renderer/windows/showcase/**/*.{ts,tsx}',
      'src/renderer/showcase.tsx',
      'tests/**/*.{ts,tsx}',
    ],
    rules: {
      'i18next/no-literal-string': 'off',
    },
  },

  // Main / preload / scripts 不准 import 前端运行时
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: { globals: globals.node },
  },

  // Worker (utility process): CJS, 无 DOM
  {
    files: ['src/main/workers/**/*.{cts,ts}'],
    languageOptions: { globals: globals.node },
  },

  // 关掉所有和 prettier 打架的规则,必须最后
  prettier,
)
