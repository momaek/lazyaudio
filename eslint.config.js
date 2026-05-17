// LazyAudio ESLint 9 flat config
// 模块边界 / IPC / i18n 等专项规则将随对应里程碑接入(coding-conventions.md §6 / §10)
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'node_modules/**', '.local-userdata/**', '.vite/**'] },

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

  // Renderer (React)
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { react, 'react-hooks': reactHooks },
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
