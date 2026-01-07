# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains the Vue 3 frontend (`App.vue`, `main.ts`) with feature folders like `components/` (common/layout/ui), `views/`, `router/`, `stores/` (Pinia), `composables/` (`use*` hooks), `assets/`, `lib/`, `types/`, and `i18n/`.
- `src-tauri/` houses the Rust/Tauri backend, including `src/` for Rust code and `tauri.conf.json` for app config.
- `public/` holds static assets copied into the build. `docs/` is project documentation. `dist/` and `src-tauri/target/` are build outputs.

## Build, Test, and Development Commands
Use `npm` or `pnpm` (lockfiles are present). Common commands:
- `npm run dev`: Start the Vite dev server for the web UI.
- `npm run tauri dev`: Run the Tauri app with hot reload.
- `npm run build`: Type-check (`vue-tsc`) and build the frontend bundle.
- `npm run preview`: Serve the production build locally.
- `npm run lint` / `npm run lint:fix`: Lint the Vue/TS sources (and optionally fix).
- `npm run format`: Format `src/**/*.{ts,vue}` with Prettier.
- `npm run typecheck`: Run `vue-tsc` without emitting files.

## Coding Style & Naming Conventions
- Formatting is enforced by Prettier: 2-space indentation, single quotes, no semicolons, and 100-char print width.
- ESLint uses Vue 3 + TypeScript recommended rules. Unused args should be prefixed with `_`.
- Follow existing naming patterns: composables in `src/composables/` use `useX` names (for example `useAudio.ts`).
- `src/types/bindings.ts` is lint-ignored; treat it as generated if it appears to be machine-produced.

## Testing Guidelines
- There is no dedicated test runner configured in `package.json`. Use `npm run typecheck` and `npm run lint` as the baseline checks.
- For behavioral changes, validate manually via `npm run dev` or `npm run tauri dev`.
- If you introduce automated tests, document the new runner and usage in this file.

## Commit & Pull Request Guidelines
- Commit messages follow a Conventional Commits style seen in history: `feat: ...`, `fix: ...`, `chore: ...`, with optional scopes like `feat(asr): ...`.
- Keep commits focused and descriptive. For PRs, include a short summary, testing notes, and screenshots/GIFs for UI changes. Link any related issues when available.
