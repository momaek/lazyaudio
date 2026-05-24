# 构建与发布

> **版本**：v0.1-draft
> **日期**：2026-05-17
> **状态**：04-development；M3 之前必读，M7 发版前必跑一遍 dry-run
> **配套**：[`../03-architecture/overview.md`](../03-architecture/overview.md) §7（Dev vs Packaged 差异表）+ [`../03-architecture/transcription-pipeline.md`](../03-architecture/transcription-pipeline.md) §3.2

---

## 0. 这份文档解决什么

把"代码 commit 后到用户能下载安装"这段链路的每个环节说清楚：

- `electron-builder` 配置
- sherpa-onnx `.node` / `.dylib` / `.dll` 的解包 + macOS install_name 改写 + 重签
- macOS 签名 / 公证 / staple
- Windows 签名 / SmartScreen
- GitHub Actions 矩阵
- `electron-updater` 自动更新
- 版本号 / changelog

**不解决**：怎么写代码（见 [`coding-conventions.md`](./coding-conventions.md)）、源码结构（见 [`project-structure.md`](./project-structure.md)）。

---

## 1. 构建管线总览

```
源码
  ├─ pnpm typecheck                       # 三套 tsconfig
  ├─ pnpm lint
  ├─ pnpm test
  └─ pnpm test:e2e                        # 跑在 packaged 包上（CI 必做）
  ↓
electron-vite build                       # main + preload + renderer → out/
  ↓
electron-builder                          # out/ → dist/
  ├─ 复制 node_modules （含 asarUnpack 解包）
  ├─ 复制 extraResources （native/templates/ + native/models/registry.json）
  ├─ afterPack hook  ← macOS：install_name_tool 改写 + codesign 重签
  ├─ afterSign hook  ← macOS：notarytool 公证 + staple
  ├─ 出 .dmg / .zip （macOS） / .exe NSIS （Windows）
  └─ 生成 latest.yml / latest-mac.yml （自动更新清单）
  ↓
上传 GitHub Releases （`--publish always` 或手动）
  ↓
用户安装 / `electron-updater` 拉更新
```

---

## 2. `electron-builder.yml`

完整草案，关键点逐条注释。**与 [`../03-architecture/transcription-pipeline.md`](../03-architecture/transcription-pipeline.md) §3.2 严格一致**。

```yaml
appId: com.wentx.lazyaudio
productName: LazyAudio
copyright: Copyright © 2026 wentx

directories:
  output: dist
  buildResources: build

files:
  - out/**/*
  - package.json
  - '!**/.{eslintrc,prettierrc,editorconfig,gitignore,gitattributes}'
  - '!**/*.{md,markdown,map,ts,tsx}' # 排除源码地图、文档
  - '!**/__tests__/**'
  - '!**/*.test.*'

extraResources:
  - from: native/templates
    to: native/templates
    filter: ['**/*']
  - from: native/models/registry.json
    to: native/models/registry.json

# 关键：sherpa-onnx 的 .node + 平台二进制必须 asarUnpack
# 主包 sherpa-onnx 是 JS 胶水，子包才是真二进制
asarUnpack:
  - node_modules/sherpa-onnx/**
  - node_modules/sherpa-onnx-darwin-arm64/**
  - node_modules/sherpa-onnx-darwin-x64/**
  - node_modules/sherpa-onnx-win32-x64/**
  # ffmpeg-static 的二进制是 ELF/Mach-O/PE 可执行，必须落盘才能 spawn
  # （transcription-pipeline §4.2 要求 glob 必须显式覆盖；漏了 → M5 T53 云端转录上传 mp3 转码时 ENOENT）
  - node_modules/ffmpeg-static/**

# ===== macOS =====
mac:
  category: public.app-category.productivity
  icon: build/icon.icns
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  notarize: false # 我们走 afterSign 自定义 notarytool，不用 builder 内置
  target:
    - target: dmg
      arch: [arm64, x64]
    - target: zip # electron-updater 需要 .zip
      arch: [arm64, x64]
  extendInfo:
    # Info.plist 字段（extendInfo），不是 entitlement
    NSMicrophoneUsageDescription: 'LazyAudio 需要麦克风权限录制您的语音。'
    # 不要加 NSScreenCaptureUsageDescription：CoreAudio Tap（macOS 14.2+）不需要它，
    # 加了反而会触发 macOS 在 Info.plist 暴露"为什么要屏幕录制"——对录音工具是奇怪体验
    LSMinimumSystemVersion: '14.2' # PRD §7.4

dmg:
  sign: false # dmg 本身不需要签（内部 .app 已签）；公证走 .app
  contents:
    - x: 130
      y: 220
    - x: 410
      y: 220
      type: link
      path: /Applications

# ===== Windows =====
win:
  icon: build/icon.ico
  target:
    - target: nsis
      arch: [x64]
  signingHashAlgorithms: [sha256]
  # signtoolOptions 通过 env 注入：CSC_LINK + CSC_KEY_PASSWORD

nsis:
  oneClick: false
  perMachine: false # per-user 安装；不需要管理员权限
  allowToChangeInstallationDirectory: true
  installerIcon: build/icon.ico
  uninstallerIcon: build/icon.ico
  shortcutName: LazyAudio
  deleteAppDataOnUninstall: false # 重装能复用模型 / 录音

# ===== Hooks =====
afterPack: scripts/after-pack.cjs # macOS install_name_tool + 重签 sherpa dylibs
afterSign: scripts/after-sign.cjs # macOS notarytool 公证 + staple

# ===== 自动更新 =====
publish:
  provider: github
  owner: <github-owner>
  repo: lazyaudio
  releaseType: release # draft → release → prerelease
```

### 2.1 `build/entitlements.mac.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <!-- onnxruntime 需要 JIT-style memory；不加这两条 app 启动直接崩 -->
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>

  <!-- 允许从 dyld cache 之外加载（asarUnpack 出来的 dylib 必备） -->
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>

  <!-- TCC：麦克风（CoreAudio Tap 不需要 screen-capture entitlement） -->
  <key>com.apple.security.device.audio-input</key>
  <true/>

  <!-- 网络（云端 LLM / 模型下载） -->
  <key>com.apple.security.network.client</key>
  <true/>
</dict>
</plist>
```

> **不要加** `com.apple.security.device.screen-capture` —— 14.2+ CoreAudio Tap 不需要，加了反而触发额外权限提示。

---

## 3. `scripts/after-pack.cjs` —— macOS dylib 改写

完整代码见 [`../03-architecture/transcription-pipeline.md`](../03-architecture/transcription-pipeline.md) §3.2.1 afterPack hook。**4 步必须全做**：

1. `install_name_tool -id @loader_path/<name>` —— 改 dylib 自身的 install name
2. `install_name_tool -change <old> @loader_path/<name>` —— 改对其他 dylib 的依赖路径（漏了 → 运行时 dyld 找不到 libonnxruntime）
3. `codesign --force` 重签每个 dylib + .node（漏了 → 公证 100% 挂）
4. 外层 .app 由 electron-builder 自动重签（在 afterSign 之前完成）

### 3.1 没有 Developer ID 时的 ad-hoc fallback（dev only）

新人头几天还在等 Apple Developer 账号批准（[`dev-environment.md`](./dev-environment.md) §2.2）就想本地 `pnpm pack:mac` 验证录音落盘——必须支持 ad-hoc 签名分支，否则 hook 没设 `APPLE_IDENTITY` 就 fail。

```js
// scripts/after-pack.cjs（codesign 步节选）
const identity = process.env.APPLE_IDENTITY ?? '-' // '-' = ad-hoc 签名
if (identity === '-') {
  console.warn(
    '[after-pack] APPLE_IDENTITY 未设，使用 ad-hoc 签名；仅 dev 测试可用，不能公证、不能分发',
  )
}
execFileSync('codesign', [
  '--force',
  '--sign',
  identity,
  '--options',
  'runtime',
  ...(identity !== '-' ? ['--entitlements', entitlementsPath, '--timestamp'] : []),
  filePath,
])
```

CI 不允许走 ad-hoc：release workflow 第一步 assert `APPLE_IDENTITY` 已设，否则 fail。

**测试**：

```bash
# 包出来之后，验证一个 dylib
otool -L dist/mac-arm64/LazyAudio.app/Contents/Resources/app.asar.unpacked/node_modules/sherpa-onnx-darwin-arm64/libsherpa-onnx-core.dylib

# 期望输出（前缀全是 @loader_path/...）
# @loader_path/libonnxruntime.dylib (...)
# @loader_path/libsherpa-onnx-cxx-api.dylib (...)
# /usr/lib/libc++.1.dylib (...)       ← 系统库保持原样

codesign -dvv dist/mac-arm64/LazyAudio.app/Contents/Resources/app.asar.unpacked/node_modules/sherpa-onnx-darwin-arm64/libsherpa-onnx-core.dylib
# 期望：能看到 Authority + TeamIdentifier，不是 "(none)"
```

---

## 4. macOS 签名 + 公证

### 4.1 一次性配置

1. **Apple Developer 账号 + Team ID**（[`dev-environment.md`](./dev-environment.md) §2.2）
2. **Developer ID Application 证书**：
   - Apple Developer 网站 → Certificates, IDs & Profiles → 新建 "Developer ID Application"
   - 下载 `.cer` → 双击导入 Keychain
   - `security find-identity -v -p codesigning` 应能看到 `Developer ID Application: Your Name (TEAM_ID)`
3. **App Store Connect API Key**：
   - 创建后下载 `.p8`，**只能下一次**，丢了重建
   - 记下 Key ID + Issuer ID
4. **环境变量**（本地 + CI 都需要）：

   ```bash
   export APPLE_ID="me@example.com"
   export APPLE_TEAM_ID="ABCDE12345"
   export APPLE_API_KEY="/Users/wentx/.keys/AuthKey_XXX.p8"
   export APPLE_API_KEY_ID="XXX"
   export APPLE_API_ISSUER="..."
   export APPLE_IDENTITY="Developer ID Application: Your Name (ABCDE12345)"
   ```

### 4.2 `scripts/after-sign.cjs`

```js
const { notarize } = require('@electron/notarize')
const path = require('path')

exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') return

  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)

  console.log(`Notarizing ${appPath}...`)
  await notarize({
    tool: 'notarytool', // 推荐；老的 altool 已弃用
    appPath,
    appleApiKey: process.env.APPLE_API_KEY,
    appleApiKeyId: process.env.APPLE_API_KEY_ID,
    appleApiIssuer: process.env.APPLE_API_ISSUER,
    teamId: process.env.APPLE_TEAM_ID,
  })
  console.log('Notarization successful, stapling...')

  const { execFileSync } = require('child_process')
  execFileSync('xcrun', ['stapler', 'staple', appPath])
}
```

依赖：

```bash
pnpm add -D @electron/notarize
```

### 4.3 验证发版包

```bash
# 1. spctl 检查 Gatekeeper 接受
spctl --assess --type execute --verbose dist/mac-arm64/LazyAudio.app
# 期望：accepted | source=Notarized Developer ID

# 2. stapler 检查 staple 完成
xcrun stapler validate dist/mac-arm64/LazyAudio.app
# 期望：The validate action worked!

# 3. 真实启动测试（必做！dev 模式过 ≠ packaged 过）
open dist/mac-arm64/LazyAudio.app
# 检查：
#   - 不弹"恶意软件"警告
#   - 麦克风权限弹窗显示 "LazyAudio" 而不是 "Electron"
#   - sherpa-onnx 能加载（onboarding 进 4a 模型下载页能继续）
```

### 4.4 公证失败的常见原因

| 报错                                                        | 根因                             | 修复                              |
| ----------------------------------------------------------- | -------------------------------- | --------------------------------- |
| `code object is not signed at all`                          | install_name_tool 改完没重签     | after-pack 检查 §3 第 3 步        |
| `The signature of the binary is invalid`                    | 签名后又被改了（如复制时丢权限） | 不要 `cp -p`，用 ditto            |
| `The executable does not have the hardened runtime enabled` | `hardenedRuntime: true` 漏配     | electron-builder.yml              |
| `The binary uses an SDK older than the 10.9 SDK`            | Electron 太老                    | 升级 Electron ≥ 35                |
| `entitlement com.apple.security.cs.allow-jit not present`   | entitlements 文件漏配            | §2.1 模板                         |
| 公证 status = "In Progress" 超过 30 min                     | Apple 服务慢                     | 等；通常 10-15 min；> 1h 联系 DTS |

---

## 5. Windows 签名

### 5.1 一次性配置

- **EV Code Signing Certificate**（DigiCert / Sectigo）—— $400+/年，硬件 token（USB dongle / cloud HSM）
- 或 OV cert（便宜，但 SmartScreen reputation 需要时间累积，新版本前期仍弹警告）
- v0.1 dogfood 阶段可以无证书（SmartScreen 警告）→ M7 商业发布前补

### 5.2 配置

```bash
export CSC_LINK="path/or/https/to/cert.pfx"
export CSC_KEY_PASSWORD="..."
```

EV cert 通常配硬件 token，签名走 `signtool` + `/csp` / `/kc`；electron-builder 25+ 支持，但本地签需配 token driver。CI 用 cloud HSM（Azure Key Vault / GCP HSM）方便：

```yaml
win:
  signingHashAlgorithms: [sha256]
  # 通过 sign 脚本调云端 HSM
  sign: scripts/win-sign-cloud-hsm.cjs
```

### 5.3 SmartScreen

新签出来的 EV cert 立即获得高信誉；OV cert 需要"用户安装积累"几周。

---

## 6. CI 矩阵

### 6.1 `.github/workflows/ci.yml`（每 PR）

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]

jobs:
  lint-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test

  # macOS：build 可以 cross，smoke 必须 native arch（否则 ARM runner 跑 x64 Electron launch 直接炸 / Rosetta 路径不齐）
  build-mac:
    strategy:
      matrix:
        include:
          - arch: arm64
            runner: macos-14 # Apple Silicon runner
            smoke: true
          - arch: x64
            runner: macos-13 # 最后一代 Intel runner；GitHub 仍在维护
            smoke: true
    runs-on: ${{ matrix.runner }}
    needs: lint-test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile

      # 注入签名 / 公证 secrets
      - name: Import codesign certs
        env:
          MAC_CERTS_P12_BASE64: ${{ secrets.MAC_CERTS_P12_BASE64 }}
          MAC_CERTS_PASSWORD: ${{ secrets.MAC_CERTS_PASSWORD }}
        run: scripts/ci/import-mac-certs.sh

      - name: Build + sign + notarize
        env:
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          APPLE_API_KEY: ${{ runner.temp }}/AuthKey.p8
          APPLE_API_KEY_ID: ${{ secrets.APPLE_API_KEY_ID }}
          APPLE_API_ISSUER: ${{ secrets.APPLE_API_ISSUER }}
          APPLE_IDENTITY: ${{ secrets.APPLE_IDENTITY }}
        run: pnpm pack:mac --${{ matrix.arch }} # pnpm 9+ 不需要 -- 分隔符

      # smoke test：真实 packaged 包，验证 sherpa 加载 + 录 1 帧
      # 必须在 native arch runner 上跑（matrix 已强制对齐）；跨架构 launch 会炸
      - name: Smoke test (signed package, native arch)
        if: matrix.smoke
        run: pnpm test:e2e --grep "smoke"

      - uses: actions/upload-artifact@v4
        with:
          name: lazyaudio-mac-${{ matrix.arch }}
          path: dist/*.dmg

  build-win:
    runs-on: windows-latest
    needs: lint-test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile

      - name: Build + sign
        env:
          CSC_LINK: ${{ secrets.WIN_CSC_LINK }}
          CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}
        run: pnpm pack:win

      - name: Smoke test
        run: pnpm test:e2e --grep "smoke"

      - uses: actions/upload-artifact@v4
        with:
          name: lazyaudio-win-x64
          path: dist/*.exe
```

### 6.2 强制 CI 项

PR 不通过下面任何一条 → 不能 merge：

- `pnpm typecheck` 三套 tsconfig 全过
- `pnpm lint` 0 warning
- `pnpm test` 单元 + renderer
- 三个平台 `build-*` job：构建 + 签名 + 公证 + smoke test 全过
- e2e smoke：能录 1 帧 PCM 落盘（即使没装模型也能验证 audio capture）
- Multi Pass 涉及的 PR：额外跑 spike-013 自动化版本

参考 [`../03-architecture/overview.md`](../03-architecture/overview.md) §7 末尾"强制 CI 项"。

### 6.3 release workflow

`.github/workflows/release.yml`，tag `v*.*.*` 触发：

```yaml
on:
  push:
    tags: ['v*.*.*']
jobs:
  release:
    # 与 ci.yml 大体相同，但：
    # 1. 额外步骤：从 tag 解析 version → 写回 package.json
    # 2. electron-builder `--publish always` 直接传 GitHub Releases
    # 3. 上传完检查 latest-mac.yml / latest.yml 都在
    # 4. 通知（Slack / Discord webhook）
```

---

## 7. 自动更新

`electron-updater` 走 GitHub Releases provider（sherpa-onnx-research §9.4）。

### 7.1 集成

```ts
// src/main/lifecycle/auto-update.ts
import { autoUpdater } from 'electron-updater'

export function initAutoUpdate(): void {
  if (!app.isPackaged) return // dev 模式不跑

  autoUpdater.autoDownload = false // 用户主动确认才下
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    // 通知 renderer 展示更新提示
    mainWindow?.webContents.send('update:available', info)
  })

  autoUpdater.on('error', (err) => {
    log.error('autoUpdater error', err)
  })

  // 启动后 10 min 检查；之后每 6 h
  setTimeout(() => autoUpdater.checkForUpdates(), 10 * 60_000)
  setInterval(() => autoUpdater.checkForUpdates(), 6 * 3600_000)
}
```

### 7.2 关键点

- **永远从"小包"链升级**——不要把 "with-models" 大包加进 publish 链路（sherpa-onnx-research §9.4）
- **macOS 自动更新需要 .zip + .dmg 两个 artifact**——electron-builder 默认会生成
- **升级失败必须有日志**：`autoUpdater.on('error')` 全 catch
- **用户可以手动跳过版本**：renderer 把"跳过此版本"存 settings，再次检查时不弹

---

## 8. 版本号 + Changelog

### 8.1 SemVer

- v0.x.y —— v0.1 之前为 pre-release，不承诺向后兼容
- v1.0.0 起严格 SemVer

### 8.2 版本号在哪里维护

`package.json` 的 `version` 字段唯一权威。打包时由 electron-builder 读。

升级命令（**tag 必须从 main 打**）：

```bash
# 1. 守卫：当前必须在 main，否则 abort —— pnpm version 会立即 commit + tag，feature 分支误打 = release.yml 错触发
[[ $(git symbolic-ref --short HEAD) == "main" ]] || { echo "must be on main"; exit 1; }
git pull --ff-only

# 2. 升版本
pnpm version patch        # 0.0.1 → 0.0.2
# 或：pnpm version minor    # 0.0.x → 0.1.0

# 3. 推 tag 触发 release workflow
git push --follow-tags
```

`release.yml` 第一步双保险：

```yaml
jobs:
  release:
    if: github.event.base_ref == 'refs/heads/main' # tag 必须从 main 分出
    runs-on: ...
```

### 8.3 changelog

`docs/04-development/changelog.md` 是发版前必更新的活文档。每个版本一段：

```markdown
## v0.1.0 — 2026-08-xx

### 新增

- ...

### 修复

- ...

### 已知问题

- ...
```

release workflow 通过 `scripts/ci/release-notes.sh` 抽当前 tag 对应的 changelog 段，写入 GitHub Release notes：

```bash
# scripts/ci/release-notes.sh
#!/usr/bin/env bash
set -euo pipefail
VERSION="${1#v}"    # 'v0.1.0' → '0.1.0'
CHANGELOG=docs/04-development/changelog.md

# 抽出 "## v0.1.0" 到下一个 "## v" 之间的内容
awk -v ver="## v${VERSION}" '
  $0 == ver           { capture=1; next }
  capture && /^## v/  { exit }
  capture             { print }
' "$CHANGELOG"
```

release workflow 调用：

```yaml
- name: Build release notes
  id: notes
  run: |
    NOTES=$(scripts/ci/release-notes.sh "${GITHUB_REF_NAME}")
    echo "notes<<EOF" >> $GITHUB_OUTPUT
    echo "$NOTES" >> $GITHUB_OUTPUT
    echo "EOF" >> $GITHUB_OUTPUT

- name: Update release
  env: { GH_TOKEN: ${{ secrets.GITHUB_TOKEN }} }
  run: gh release edit "${GITHUB_REF_NAME}" --notes "${{ steps.notes.outputs.notes }}"
```

抽不到（changelog 漏更新当前版本段）→ workflow fail；release 不发，避免空 notes 出去。

---

## 9. 发版 checklist

每次发版（M7 之后每个 release）按这个清单走：

```
准备
□ 所有 P0 issue 关闭
□ changelog.md 更新到当前版本
□ 至少 24h dogfood 通过（自己每天用没崩）
□ Apple 公证服务状态正常（https://developer.apple.com/system-status/）

打包
□ git checkout main && git pull
□ pnpm version patch/minor
□ git push --follow-tags

CI 通过
□ release workflow 全绿
□ artifacts：macOS arm64 .dmg + .zip / macOS x64 .dmg + .zip / Win x64 .exe
□ latest-mac.yml / latest.yml 已生成
□ GitHub Release 自动建好（draft）

人工验证
□ 下载 macOS arm64 包到一台干净机器（或新 user）
  □ 双击安装，spctl --assess 通过
  □ 启动不报 Gatekeeper 警告
  □ 麦克风权限弹窗显示 "LazyAudio"
  □ Onboarding 模型下载页能继续
  □ 录 30s + 转录 + 摘要 端到端通
□ 同步在 macOS x64 / Win x64 各跑一遍

发布
□ GitHub Release 从 draft → published
□ electron-updater 检查：装老版本能拉到新版本

dogfood 监控
□ release 后 24h 不动 → 看自己 + 早期用户反馈
□ 有任何 P0 → patch release，不要在原 release 上 fix
```

---

## 10. 常见 release 翻车

| 症状                                             | 排查                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| 公证 stuck "In Progress" > 30 min                | Apple 服务慢；继续等；> 2h `xcrun notarytool log` 看具体错                     |
| 公证成功但 staple 失败                           | App 路径错误（hook 拿 productFilename 没拿到）→ 改 after-sign 路径             |
| dmg 装到新机能启动，但拖到 Applications 不能启动 | 签名是 ad-hoc 不是 Developer ID → APPLE_IDENTITY 没配                          |
| Win SmartScreen 报 "未知发布者"                  | OV cert 没积累 / EV cert 没生效 → 等几天 / 换 EV                               |
| 自动更新拉到 .yml 但下载失败                     | publish 配的 owner/repo 错；或 GitHub Releases 限速（罕见）                    |
| 升级后第一次启动崩                               | electron-updater 替换 app 时 sherpa-onnx-\* 平台包丢了 → asarUnpack 配置漏一项 |

---

## 11. 下一阶段

构建链路清楚了 → [`development-plan.md`](./development-plan.md) 看 M3-M7 怎么排。
