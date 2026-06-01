// T50 — 系统版本支持检测。
//
// 与 ADR-0001 / onboarding 屏 0 对齐:macOS 14.2+、Windows 10 2004(build 19041)+。

import os from 'node:os'
import type { PlatformSupport } from '@shared/ipc/onboarding'

export interface RuntimePlatformInfo {
  platform: NodeJS.Platform
  release: string
}

function parseDarwinVersion(release: string): { major: number; minor: number } | null {
  const [majorRaw, minorRaw] = release.split('.')
  const major = Number(majorRaw)
  const minor = Number(minorRaw ?? '0')
  if (!Number.isInteger(major) || !Number.isInteger(minor)) return null
  return { major, minor }
}

function darwinToMacVersion(release: string): string {
  const parsed = parseDarwinVersion(release)
  if (!parsed) return `macOS (${release || '未知版本'})`
  const macMajor = parsed.major - 9
  if (macMajor <= 0) return `macOS (${release})`
  return `macOS ${macMajor}.${parsed.minor}`
}

function parseWindowsBuild(release: string): number | null {
  const [, , buildRaw] = release.split('.')
  const build = Number(buildRaw)
  return Number.isInteger(build) ? build : null
}

export function evaluatePlatformSupport(info: RuntimePlatformInfo): PlatformSupport {
  if (info.platform === 'darwin') {
    const parsed = parseDarwinVersion(info.release)
    const detected = darwinToMacVersion(info.release)
    const ok = parsed ? parsed.major > 23 || (parsed.major === 23 && parsed.minor >= 2) : false
    return {
      ok,
      platform: 'darwin',
      detected,
      title: ok ? '系统版本符合要求' : '需要 macOS 14.2 或更新',
      detail: ok
        ? 'LazyAudio 可以使用 CoreAudio Tap 录制系统音。'
        : 'LazyAudio 用 macOS 14.2 引入的 CoreAudio Tap 录系统音，避免向你索要“屏幕录制”权限。请先升级 macOS 再启动。',
      primaryLabel: '打开系统更新',
    }
  }

  if (info.platform === 'win32') {
    const build = parseWindowsBuild(info.release)
    const ok = build !== null && build >= 19041
    return {
      ok,
      platform: 'win32',
      detected:
        build === null ? `Windows (${info.release || '未知版本'})` : `Windows build ${build}`,
      title: ok ? '系统版本符合要求' : '需要 Windows 10 2004 或更新',
      detail: ok
        ? 'LazyAudio 可以使用 Windows loopback 接口录制系统音。'
        : 'LazyAudio 依赖较新的 Windows 音频 loopback 接口，旧版可能录音失败或崩溃。请先更新 Windows 再启动。',
      primaryLabel: '打开 Windows 更新',
    }
  }

  return {
    ok: false,
    platform: 'unsupported',
    detected: `${info.platform} ${info.release || ''}`.trim(),
    title: '暂未支持当前系统',
    detail: 'LazyAudio v0.1 只支持 macOS 14.2+ 和 Windows 10 2004+。Linux 支持没有计划。',
  }
}

export function getPlatformSupport(): PlatformSupport {
  return evaluatePlatformSupport({ platform: process.platform, release: os.release() })
}

export function systemUpdateUrl(platform: PlatformSupport['platform']): string | null {
  if (platform === 'darwin') {
    return 'x-apple.systempreferences:com.apple.preferences.softwareupdate'
  }
  if (platform === 'win32') {
    return 'ms-settings:windowsupdate'
  }
  return null
}
