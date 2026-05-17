# 开发环境

> **版本**：v0.1-draft
> **日期**：2026-05-17
> **状态**：04-development；任何新加入的开发者按本文档跑一遍即可上手
> **目标**：`git clone` 到 `pnpm dev` 跑起来 ≤ 30 min（不含 Apple Developer 账号申请）

---

## 0. 这份文档解决什么

- 装哪些版本的 Node / pnpm / Xcode CLT / VS Build Tools
- 怎么 clone、装依赖、跑 dev
- macOS 签名 + 公证需要哪些账号 / 钥匙
- 第一次跑 sherpa-onnx 时会遇到的常见问题与诊断

**不解决**：项目目录解释（见 [`project-structure.md`](./project-structure.md)）、打包发布（见 [`build-and-release.md`](./build-and-release.md)）。

---

## 1. 硬件 / OS 要求

### 1.1 开发机

| 平台    | 最低要求                                | 推荐                  |
| ------- | --------------------------------------- | --------------------- |
| macOS   | 14.2+（Sonoma），Intel 或 Apple Silicon | M 系列芯片，macOS 15+ |
| Windows | 10 21H2+ / 11，x64                      | Win11 x64             |
| Linux   | Ubuntu 22.04+ / Fedora 38+，x64         | —                     |

> v0.1 不发 Linux，但 Linux 上能跑 dev 模式（spike / unit test）；只有打包发布走不通。

### 1.2 跨平台开发

- macOS dev → 可以本地构建 macOS 包，**不能**本地构建 Windows 签名包（需 Windows code signing cert + 平台二进制）
- Windows dev → 同理，不能本地构建 macOS 签名包（需 macOS hardware 跑 codesign / notarytool）
- 推荐：开发主力机一台，另一平台靠 **CI**（GitHub Actions runner）出包

---

## 2. 必装工具链

### 2.1 通用

| 工具        | 版本                              | 安装方式                                                     | 校验            |
| ----------- | --------------------------------- | ------------------------------------------------------------ | --------------- |
| **Node.js** | ≥ 20 LTS（锁主版本，见 `.nvmrc`） | nvm / volta / fnm                                            | `node -v`       |
| **pnpm**    | ≥ 9                               | `corepack enable && corepack prepare pnpm@latest --activate` | `pnpm -v`       |
| **git**     | ≥ 2.40                            | 系统包管理器                                                 | `git --version` |
| **Python**  | 3.10–3.12                         | 系统包管理器                                                 | `python3 -V`    |

> Python 是 **node-gyp 隐式依赖**——99% 的 native 包用 prebuilt 不会触发，但保险起见装上，遇到 native build 失败时不至于卡住。

### 2.2 macOS 特有

```bash
xcode-select --install               # Xcode Command Line Tools，提供 clang / make / codesign
brew install --cask docker           # 可选；CI 镜像本地预演用
```

**Apple Developer 账号**（必须，否则签名 / 公证跑不动）：

- $99/年；申请到批准约 1-3 天
- 登录 [App Store Connect](https://appstoreconnect.apple.com) → Users and Access → Integrations → App Store Connect API
- 创建一个 API Key，下载 `.p8` 文件（**只能下一次**），记下 Key ID + Issuer ID
- 这三件事缺一不可：`.p8` 文件、Key ID、Issuer ID

详见 [`build-and-release.md`](./build-and-release.md) §4。

### 2.3 Windows 特有

```powershell
# 用管理员 PowerShell
winget install -e --id Microsoft.VisualStudio.2022.BuildTools
# 选 "Desktop development with C++" workload
```

**Windows code signing 证书**（v0.1 可暂用 self-signed 跑 dev / CI，发布时换正式 EV cert）：

- 推荐 DigiCert / Sectigo EV Code Signing；硬件 token + 年费 ~$400
- 没有 EV cert → 用户首次启动 Windows SmartScreen 警告（"未知发布者"），需点 "More info → Run anyway"
- v0.1 dogfood 阶段可接受 SmartScreen 警告；正式发布前补 EV cert

### 2.4 编辑器（强烈推荐）

| 编辑器               | 必装插件                                                           |
| -------------------- | ------------------------------------------------------------------ |
| **VS Code** / Cursor | ESLint、Prettier、Tailwind CSS IntelliSense、EditorConfig、GitLens |
| WebStorm             | 内置                                                               |

`.vscode/extensions.json` 已列推荐插件，VS Code 打开会自动提示安装。

---

## 3. 第一次 setup

### 3.1 clone + 安装

```bash
git clone https://github.com/<owner>/lazyaudio.git
cd lazyaudio

# 锁定 Node 版本（如果用了 nvm / fnm）
nvm use                              # 读 .nvmrc，自动切到对应版本

# 启用 corepack 后用 pnpm
corepack enable
pnpm install
```

第一次 install 会做：

1. 装 dependencies + devDependencies + 当前平台的 `sherpa-onnx-{platform}-{arch}` optional
2. 触发 `simple-git-hooks` 注册 pre-commit hook
3. 触发 electron 的 postinstall 下载 electron binary（~120 MB）—— 走 npmmirror.com 镜像参考 §6.1

**预期耗时**：10–20 min（取决于网速）。

### 3.2 验证 prebuilt

第一次装完跑一次校验，确认当前平台的 sherpa-onnx 二进制可加载：

```bash
pnpm verify:prebuilt
```

期望输出：

```
✓ Found sherpa-onnx-darwin-arm64 at node_modules/sherpa-onnx-darwin-arm64
✓ .node addon loadable
✓ libsherpa-onnx-core.dylib install_name = absolute path（dev 正常；packaged 会被 install_name_tool 改成 @loader_path）
✓ require('sherpa-onnx') returns OfflineRecognizer
```

如果失败 → §8 排错。

### 3.3 启动 dev

```bash
pnpm dev
```

electron-vite 会：

- 起 Vite dev server（renderer，HMR）
- 编译主进程 / preload（watch + 自动 reload electron）
- 启动 Electron 加载 `out/main/index.js`

**第一次启动**会触发 onboarding 窗口；如果想跳过（dev 时反复打开嫌烦）：

```bash
pnpm dev:reset      # 清掉本地 userData，重置到"未 onboarding"状态
# 或者
LAZYAUDIO_SKIP_ONBOARDING=1 pnpm dev
```

`LAZYAUDIO_SKIP_ONBOARDING` 在 dev 模式下读 `process.env`，packaged 包忽略。

### 3.4 dev 模式下的 userData 路径

为了不污染真实安装的 LazyAudio 数据，dev 模式把 `userData` 重定向到仓库内 `.local-userdata/`：

```ts
// src/main/env.ts
import path from 'node:path'
import { app } from 'electron'

// dev 模式 cwd = 仓库根（pnpm dev 总是在仓库根启动）；不要靠 __dirname / import.meta.dirname：
//   - main 产物在 out/main/，相对 ../../ 跳出去严重依赖 electron-vite 输出布局
//   - 主进程在 ESM 输出时 __dirname 不存在（详见 project-structure §8.0.1 / §9）
// process.cwd() 在 pnpm dev 时稳定指向仓库根，简单可靠
if (!app.isPackaged) {
  app.setPath('userData', path.join(process.cwd(), '.local-userdata'))
}
```

- 模型下载、录音、设置都在 `.local-userdata/` 下
- 已在 `.gitignore` 里
- 删掉这个目录 = "全新用户首启"

---

## 4. 国内开发者镜像

国内访问 GitHub Releases / HuggingFace / npm 都慢，列一份镜像清单。**项目里不硬编码**——通过环境变量 / config 切换。

### 4.1 pnpm registry

```bash
pnpm config set registry https://registry.npmmirror.com
```

或者在仓库内 `.npmrc`（团队共享）：

```ini
registry=https://registry.npmmirror.com
electron_mirror=https://npmmirror.com/mirrors/electron/
electron_builder_binaries_mirror=https://npmmirror.com/mirrors/electron-builder-binaries/
```

### 4.2 sherpa-onnx 模型镜像

模型不进 npm 包，按 [`../03-architecture/transcription-pipeline.md`](../03-architecture/transcription-pipeline.md) §3.5 走多源 fallback：

| 源              | URL                                            | 用途     |
| --------------- | ---------------------------------------------- | -------- |
| hf-mirror       | https://hf-mirror.com                          | 国内默认 |
| ModelScope      | https://modelscope.cn                          | 国内备选 |
| HuggingFace     | https://huggingface.co                         | 海外默认 |
| GitHub Releases | https://github.com/k2-fsa/sherpa-onnx/releases | 终极兜底 |

下载器自动按列表 head 测速选最快的，不需要人工切。

### 4.3 git clone

如果 GitHub clone 慢：

```bash
git config --global url."https://gh-proxy.com/https://github.com/".insteadOf "https://github.com/"
```

或用 SSH，绕开 HTTPS 限速。

---

## 5. 日常开发命令

```bash
# 开发
pnpm dev                             # 起 dev（带 HMR）
pnpm dev:reset                       # 清 userData 再 dev
pnpm typecheck                       # 三套 tsconfig 全跑

# 测试
pnpm test                            # vitest 单元 + renderer
pnpm test --watch                    # watch 模式
pnpm test:e2e                        # playwright e2e（需先 pnpm build）
pnpm test:e2e --headed               # 看 UI 跑

# 质量
pnpm lint                            # ESLint
pnpm lint --fix
pnpm format                          # Prettier 全量
pnpm verify:prebuilt                 # 校验 sherpa-onnx 可加载

# 打包（本地）
pnpm build                           # electron-vite build（不打 installer）
pnpm pack:mac --arm64                # 出 arm64 .dmg；pnpm 9+ 直接透传 flag，不再需要 --
pnpm pack:mac --x64
pnpm pack:win                        # 出 .exe（需 Windows + 已配 codesign）
```

---

## 6. 环境变量速查

dev 模式下读 `.env` / `.env.local`（被 `.gitignore`）；packaged 不读 `.env`。

```bash
# .env.example （提交进 git，作为模板）

# 跳过 onboarding（dev only）
LAZYAUDIO_SKIP_ONBOARDING=

# 强制走云端转录（debug 用，正常通过 UI 切）
LAZYAUDIO_FORCE_PRIVACY_MODE=                    # local | cloud

# 替换模型镜像（debug 用）
LAZYAUDIO_MODEL_MIRROR=                          # 完整 URL，覆盖 fallback 列表

# 启用 verbose 日志
LAZYAUDIO_LOG_LEVEL=info                         # error | warn | info | debug | trace

# === macOS 签名 / 公证 ===
# 这些只在打包时用；CI 通过 secrets 注入；本地开发不需要
APPLE_ID=                                        # 你的 Apple 账号 email
APPLE_TEAM_ID=                                   # Developer 账号 Team ID
APPLE_API_KEY=                                   # .p8 文件路径，如 ~/.keys/AuthKey_XXX.p8
APPLE_API_KEY_ID=                                # Key ID
APPLE_API_ISSUER=                                # Issuer ID
APPLE_IDENTITY=                                  # 签名 identity，如 "Developer ID Application: Your Name (TEAM)"

# === Windows 签名 ===
CSC_LINK=                                        # .pfx 路径或 https
CSC_KEY_PASSWORD=
```

---

## 7. 调试

### 7.1 主进程调试

VS Code `launch.json`（仓库已带）：

```json
{
  "type": "node",
  "request": "launch",
  "name": "Electron Main",
  "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/electron",
  "args": ["--inspect=5858", "."],
  "outputCapture": "std"
}
```

或者命令行：

```bash
ELECTRON_ENABLE_LOGGING=1 ELECTRON_ENABLE_STACK_DUMPING=1 pnpm dev
```

### 7.2 Renderer 调试

dev 模式下 renderer 自动开 DevTools（`Cmd+Opt+I` / `F12`）。React DevTools / Zustand DevTools 已集成（通过浏览器扩展）。

### 7.3 Utility process 调试

**重要**：`utilityProcess.fork` 的 `ForkOptions` 没有 `execArgv` 字段（与 Node 的 `child_process.fork` 不一样）；utility process 是 Electron 派生的 service 二进制，不接 Node CLI flag。试图 `--inspect=9229` + chrome://inspect 走不通。

v0.1 实际用的调试手段：

1. **`stdio: 'inherit'` + `console.log`**：dev 模式 utility 的 stdout/stderr 直接进 electron 主进程终端。最直接、最够用。

   ```ts
   if (!app.isPackaged) {
     utilityProcess.fork(entry, [], { stdio: 'inherit' })
   }
   ```

2. **`parentPort.postMessage({ type: 'log', level, msg })`**：主进程订阅后统一 log 到 `~/Library/Logs/LazyAudio/asr.log`；packaged 模式也能看（详见 [`../03-architecture/overview.md`](../03-architecture/overview.md) §6.5）

3. **要真断点调试**：临时把 utility 入口换成 `child_process.fork`（可接 `--inspect`）跑一次 repro；修完 bug 切回 `utilityProcess.fork`。**不要**为了能 inspect 把生产路径改成 child_process——丢掉 Electron 提供的崩溃事件 + MessagePort transferable，得不偿失。

v0.x 如果常用 inspect，再 spike 一次 `NODE_OPTIONS=--inspect` 通过 env 注入是否能透传到 utility helper（Electron 文档没承诺，需实测）。

### 7.4 日志

| 来源     | dev 路径                               | packaged 路径                       |
| -------- | -------------------------------------- | ----------------------------------- |
| 主进程   | stdout                                 | `~/Library/Logs/LazyAudio/main.log` |
| Utility  | stdout（通过 parentPort 转发到主进程） | 同上 `asr.log`                      |
| Renderer | DevTools console                       | 不落盘（隐私）                      |

dev 模式 stdout 直接看；packaged 调试需要：

```bash
# macOS
tail -f ~/Library/Logs/LazyAudio/main.log

# Windows
Get-Content $env:APPDATA\LazyAudio\logs\main.log -Wait
```

---

## 8. 常见问题排错

### 8.1 `Cannot find module 'sherpa-onnx'`

**原因**：optionalDependencies 没装到当前平台的 prebuilt 包。

**排查**：

```bash
ls node_modules | grep sherpa-onnx
# 应该有 sherpa-onnx + sherpa-onnx-{platform}-{arch} 两个
```

**修复**：

```bash
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

如果还失败，强制指定：

```bash
pnpm install sherpa-onnx-darwin-arm64 --save-optional
```

### 8.2 macOS：`dyld: Library not loaded: libonnxruntime.dylib`（dev 模式）

**原因**：dev 模式下 dylib 路径靠 `DYLD_FALLBACK_LIBRARY_PATH`，但 macOS Helper 进程 SIP 剥环境变量。

**修复**：electron-vite 已在 main 入口最早期 set；如果还失败，确认你跑的是 `pnpm dev` 而不是 `electron .`。

### 8.3 macOS：第一次启动弹窗"麦克风权限被拒"

**原因**：dev 模式下 Electron Helper 进程的 bundle id 是 `com.github.Electron`，不是 `LazyAudio`。

**正常表现**：dev 模式弹的权限框写的是 "Electron" 而不是 "LazyAudio"，是预期行为；点同意即可。

**注意**：这意味着 dev 模式下的权限测试**不算数**——必须打签名包再测真实用户路径（见 [`../03-architecture/overview.md`](../03-architecture/overview.md) §7 dev vs packaged 表）。

### 8.4 Windows：`electron-builder` 报 "AppX cannot be packaged"

**原因**：v0.1 不出 AppX（不发 Microsoft Store）。

**修复**：`electron-builder.yml` 里 `targets` 仅留 `nsis`，删 `appx`。

### 8.5 `pnpm dev` 后 Electron 不打开主窗口

**排查**：

1. 看 stdout 有无报错
2. `~/Library/Logs/LazyAudio/main.log` 末尾
3. `.local-userdata/` 是不是被 onboarding 卡住——`pnpm dev:reset`

### 8.6 `vitest` 跑不起来：`Cannot find package '@vitejs/plugin-react'`

**原因**：pnpm hoisting 严格，dev 包没装。

**修复**：

```bash
pnpm install -D @vitejs/plugin-react
```

### 8.7 改了 main 代码，electron 不自动重启

**原因**：electron-vite 默认对 main 的修改触发**重启**（不是 HMR）；如果没重启，多半是 `externalizeDepsPlugin` 把你的新 import 当外部包了。

**修复**：把内部模块的 import 改成相对路径（`./foo`）或 alias（`@shared/...`），避免被外部化。

### 8.8 `pnpm dev` 起来 `window.lazyaudio` 在 renderer 里 undefined

两个坑叠加(T05 实测踩过):

1. **sandbox: true 下 Electron 不支持 ESM preload**:electron-vite 默认把 preload 输出成 `.mjs`,Electron 静默拒绝加载,**preload 完全不跑,没任何报错**。
   修法:`electron.vite.config.ts` 的 preload 段设 `output: { format: 'cjs', entryFileNames: '[name].js' }`,主进程 `webPreferences.preload` 用 `.js`。
2. **sandbox preload 不能引第三方运行时**(zod / 第三方 npm 包等);上游模块通过 import 链拽进来也算。
   修法:把 channel 名常量拆到 `shared/ipc/channels.ts`(纯字符串,无 zod),preload 只引那个;含 zod schema 的 `shared/ipc/{system,record,settings}.ts` 仅给 main / renderer 业务层引。

**排查路径**:在 preload/index.ts 临时加 `console.info('[preload] hi')`,看主进程终端有没有这行 — 没有 → preload 没跑(坑 1);有但 `exposeInMainWorld` 报错 → 沙箱拒绝(坑 2)。

---

## 9. 推荐的 daily workflow

```
早上：
  git pull
  pnpm install                       # lockfile 变了
  pnpm dev

写代码：
  - 改完一个完整的 feature
  - pnpm typecheck
  - pnpm test
  - 本地验证（dev）
  - 必要时 pnpm pack:mac 出本地包再验一遍（涉及 native / 权限的改动必跑）

提交：
  pre-commit hook 自动跑 lint-staged
  git commit
  git push
  PR 模板里贴：测试截图 / 涉及的 spike / 触发了哪些 CI job
```

---

## 10. 下一阶段

环境跑起来了 → [`coding-conventions.md`](./coding-conventions.md) 看写代码的规约。
