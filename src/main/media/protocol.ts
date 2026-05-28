// T16 — 录音音频自定义流式协议。
//
// renderer 在 webSecurity: true 下不能直接 file:// 读录音目录,所以由 main 注册
// `lazyaudio-media://recording/<recordingId>` scheme,解析最佳轨道后流式吐 wav。
//   - 优先级:mixed.wav(合成轨)> mic.wav > system.wav
//   - 走 net.fetch(file://) 并转发原请求头(含 Range),让 <audio> 能拖动 seek
//   - 路径穿越防护:recordingId 只允许字母数字,且解析后的绝对路径必须落在 recordings/ 内
//
// scheme 必须在 app ready 前 registerSchemesAsPrivileged;handle 在 ready 后注册。

import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { protocol, net } from 'electron'
import { MEDIA } from '@shared/ipc/channels'
import { logger } from '../logger'
import { getAudioFilePath, getMixedFilePath, getRecordingsDir } from '../recording/paths'
import { readMeta } from '../recording/meta-store'

const ID_RE = /^[0-9A-Za-z]{1,64}$/

export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA.scheme,
      privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true },
    },
  ])
}

async function fileSize(filePath: string): Promise<number> {
  try {
    const stat = await fs.stat(filePath)
    return stat.isFile() ? stat.size : 0
  } catch {
    return 0
  }
}

/** 按 mixed > mic > system 选第一个存在且非空的轨道文件;都没有返回 null */
async function resolveTrackFile(recordingId: string): Promise<string | null> {
  const meta = await readMeta(recordingId)
  const ordered: string[] = []
  if (meta) {
    if (meta.audioFiles.mixed) ordered.push(getMixedFilePath(recordingId))
    if (meta.audioFiles.mic) ordered.push(getAudioFilePath(recordingId, 'mic'))
    if (meta.audioFiles.system) ordered.push(getAudioFilePath(recordingId, 'system'))
  }
  // meta 缺失 / 未登记(崩溃恢复前)也兜底直接探盘
  if (ordered.length === 0) {
    ordered.push(
      getMixedFilePath(recordingId),
      getAudioFilePath(recordingId, 'mic'),
      getAudioFilePath(recordingId, 'system'),
    )
  }
  for (const candidate of ordered) {
    if ((await fileSize(candidate)) > 0) return candidate
  }
  return null
}

/** 解析后的绝对路径必须在 recordings/ 目录内,防 `..` 穿越 */
function isInsideRecordings(filePath: string): boolean {
  const root = path.resolve(getRecordingsDir())
  const resolved = path.resolve(filePath)
  return resolved === root || resolved.startsWith(root + path.sep)
}

async function handleRequest(request: Request): Promise<Response> {
  let url: URL
  try {
    url = new URL(request.url)
  } catch {
    return new Response(null, { status: 400 })
  }
  if (url.hostname !== MEDIA.host) return new Response(null, { status: 404 })

  const recordingId = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
  if (!ID_RE.test(recordingId)) {
    logger.warn(`[media] rejected invalid recordingId: ${recordingId}`)
    return new Response(null, { status: 400 })
  }

  const filePath = await resolveTrackFile(recordingId)
  if (!filePath || !isInsideRecordings(filePath)) {
    return new Response(null, { status: 404 })
  }

  // 转发 Range 头 → net 的 file handler 返 206 + Content-Range,<audio> 才能拖动
  const upstream = await net.fetch(pathToFileURL(filePath).toString(), {
    headers: request.headers,
  })
  const headers = new Headers(upstream.headers)
  if (!headers.has('content-type')) headers.set('content-type', 'audio/wav')
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  })
}

export function registerMediaProtocol(): void {
  protocol.handle(MEDIA.scheme, (request) =>
    handleRequest(request).catch((e) => {
      logger.error(`[media] handler error: ${String(e)}`)
      return new Response(null, { status: 500 })
    }),
  )
}
