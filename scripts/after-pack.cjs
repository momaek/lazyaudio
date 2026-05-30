// macOS afterPack hook(ADR-0002 落地)。
//
// npm prebuilt 的 sherpa-onnx .dylib 的 install_name 写死成构建机绝对路径;packaged + SIP 剥掉
// 所有 DYLD_* 后,dyld 按绝对路径找不到 dylib → ASR 一加载就崩。这里把每个 .dylib 的 install_name
// (-id)+ 相互依赖(-change)改写成 @loader_path/...,让 dyld 按 .node 同目录解析(与 SIP 无关),
// 改完必须重签(Mach-O header 改动会让原签名失效)。详见 transcription-pipeline.md §3.2.1。
//
// 签名:APPLE_IDENTITY 未设 → '-'(ad-hoc,仅本地验证可用,不能公证 / 分发)。
// 正式 Developer ID 签名 + 公证(spctl --assess accepted)留 T70(CI release workflow 会 assert 证书已设)。

const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

exports.default = async function afterPack(context) {
  const { appOutDir, electronPlatformName, packager } = context
  if (electronPlatformName !== 'darwin') return

  const appName = packager.appInfo.productFilename // 'LazyAudio'
  const unpackedNodeModules = path.join(
    appOutDir,
    `${appName}.app/Contents/Resources/app.asar.unpacked/node_modules`,
  )
  if (!fs.existsSync(unpackedNodeModules)) {
    console.warn(`[after-pack] no app.asar.unpacked/node_modules at ${unpackedNodeModules}; skip`)
    return
  }

  // 所有 sherpa-onnx-darwin-* 平台子包目录(arm64 / x64,按实际打进包的为准)
  const platformDirs = fs
    .readdirSync(unpackedNodeModules)
    .filter((d) => d.startsWith('sherpa-onnx-darwin-'))
    .map((d) => path.join(unpackedNodeModules, d))

  if (platformDirs.length === 0) {
    console.warn('[after-pack] no sherpa-onnx-darwin-* platform dir found; skip')
    return
  }

  const identity = process.env.APPLE_IDENTITY || '-'
  if (identity === '-') {
    console.warn(
      '[after-pack] APPLE_IDENTITY 未设,使用 ad-hoc 签名;仅本地验证可用,不能公证 / 分发(spctl gate T70)',
    )
  }
  const entitlements = path.join(process.cwd(), 'build/entitlements.mac.plist')

  for (const dir of platformDirs) {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.dylib') || f.endsWith('.node'))

    for (const f of files) {
      const filePath = path.join(dir, f)

      // 1. 改 dylib 自身 install_name(.node 是 MH_BUNDLE,无 install_name,跳过)
      if (f.endsWith('.dylib')) {
        execFileSync('install_name_tool', ['-id', `@loader_path/${f}`, filePath])
      }

      // 2. 改对其它"本目录内 dylib"的 LC_LOAD_DYLIB 依赖路径(关键:漏了运行时 dyld 找不到
      //    libonnxruntime;系统库 /usr/lib /System 保持原样)。.node 也有依赖,同样处理。
      const otoolOut = execFileSync('otool', ['-L', filePath]).toString()
      const lines = otoolOut.split('\n').slice(1) // 跳过首行 "<filePath>:"
      for (const line of lines) {
        const oldPath = line.trim().split(/\s+/)[0]
        if (!oldPath) continue
        const baseName = path.basename(oldPath)
        if (files.includes(baseName) && !oldPath.startsWith('@loader_path')) {
          execFileSync('install_name_tool', [
            '-change',
            oldPath,
            `@loader_path/${baseName}`,
            filePath,
          ])
        }
      }

      // 3. 改完重签。ad-hoc('-')省略 entitlements / timestamp(那些只对正式签名 + 公证有意义)。
      const signArgs = ['--force', '--sign', identity, '--options', 'runtime']
      if (identity !== '-') {
        signArgs.push('--entitlements', entitlements, '--timestamp')
      }
      signArgs.push(filePath)
      execFileSync('codesign', signArgs)
    }
    console.log(
      `[after-pack] rewrote + re-signed ${files.length} binaries in ${path.basename(dir)}`,
    )
  }
}
