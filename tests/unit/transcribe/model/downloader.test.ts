// T31 — downloader.ts 续传 / 源切换 / 完成 单测。
// 用本地 http.createServer 当镜像源,避免真网络:
//   - /good/{file} 正确字节(支持 Range → 测续传)
//   - /bad/{file}  损坏字节(触发 sha 不匹配 → 切下一源)
// mock electron(app.getPath→tmp / getLocale→en)+ logger + registry(指向本地源)。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import type { ModelEvent } from '@shared/ipc/model'

// 确定性数据(不用随机,便于复算 sha)
const DATA = Buffer.from(Uint8Array.from({ length: 50_000 }, (_, i) => i % 256))
const DATA_SHA = createHash('sha256').update(DATA).digest('hex')
const CORRUPT = Buffer.concat([DATA.subarray(0, 49_999), Buffer.from([0xff ^ DATA[49_999]!])])
const TOKENS = Buffer.from('zero\none\ntwo\n')
const TOKENS_SHA = createHash('sha256').update(TOKENS).digest('hex')

const DOWNLOADER = '../../../../src/main/transcribe/model/downloader'

let server: http.Server
let port: number
let tmpDir: string
let mockEntry: Record<string, unknown>

function respond(req: http.IncomingMessage, res: http.ServerResponse, buf: Buffer): void {
  if (req.method === 'HEAD') {
    res.writeHead(200, { 'content-length': String(buf.length), 'accept-ranges': 'bytes' })
    res.end()
    return
  }
  const range = req.headers.range
  if (range) {
    const m = /bytes=(\d+)-/.exec(range)
    const start = m ? Number(m[1]) : 0
    res.writeHead(206, {
      'content-range': `bytes ${start}-${buf.length - 1}/${buf.length}`,
      'content-length': String(buf.length - start),
      'accept-ranges': 'bytes',
    })
    res.end(buf.subarray(start))
    return
  }
  res.writeHead(200, { 'content-length': String(buf.length), 'accept-ranges': 'bytes' })
  res.end(buf)
}

beforeEach(async () => {
  vi.resetModules()
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lazyaudio-dl-'))

  server = http.createServer((req, res) => {
    const url = req.url ?? ''
    if (url.endsWith('/good/data.bin')) return respond(req, res, DATA)
    if (url.endsWith('/good/tokens.txt')) return respond(req, res, TOKENS)
    if (url.endsWith('/bad/data.bin')) return respond(req, res, CORRUPT)
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as AddressInfo).port

  mockEntry = {
    key: 'test-model',
    kind: 'asr',
    displayName: 'Test',
    description: '',
    lang: 'zh',
    version: '1',
    sizeBytes: DATA.length + TOKENS.length,
    files: [
      { relPath: 'data.bin', sha256: DATA_SHA, bytes: DATA.length },
      { relPath: 'tokens.txt', sha256: TOKENS_SHA, bytes: TOKENS.length },
    ],
    sources: [`http://127.0.0.1:${port}/good/{file}`],
    isDefault: true,
  }

  vi.doMock('electron', () => ({
    app: { getPath: () => tmpDir, getLocale: () => 'en-US' },
  }))
  vi.doMock('../../../../src/main/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  }))
  vi.doMock('../../../../src/main/transcribe/model/registry', () => ({
    getModelEntry: (k: string) => (k === mockEntry.key ? mockEntry : undefined),
    listModelEntries: () => [mockEntry],
    resolveSourceUrl: (tpl: string, rel: string) => tpl.replace('{file}', rel),
  }))
  // 关掉 HEAD 测速重排,保证源顺序确定(否则 bad/good 可能被按延迟换序)
  vi.doMock('../../../../src/main/transcribe/model/mirror', () => ({
    orderSources: (sources: string[]) => [...sources],
    probeFastest: async () => null,
  }))
})

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await fs.rm(tmpDir, { recursive: true, force: true })
  vi.doUnmock('electron')
  vi.doUnmock('../../../../src/main/logger')
  vi.doUnmock('../../../../src/main/transcribe/model/registry')
  vi.doUnmock('../../../../src/main/transcribe/model/mirror')
})

async function runDownload(): Promise<ModelEvent[]> {
  const mod = await import(DOWNLOADER)
  const events: ModelEvent[] = []
  await mod.downloadModel('test-model', (e: ModelEvent) => events.push(e))
  return events
}

describe('downloadModel', () => {
  it('全新下载 → done + 文件落盘 + manifest 写入', async () => {
    const events = await runDownload()
    expect(events.at(-1)?.phase).toBe('done')
    expect(events[0]?.phase).toBe('start')

    const dir = path.join(tmpDir, 'models', 'test-model')
    expect((await fs.stat(path.join(dir, 'data.bin'))).size).toBe(DATA.length)
    expect((await fs.stat(path.join(dir, 'tokens.txt'))).size).toBe(TOKENS.length)
    const manifest = JSON.parse(
      await fs.readFile(path.join(tmpDir, 'models', 'manifest.json'), 'utf8'),
    )
    expect(manifest['test-model'].version).toBe('1')

    // listModels 现在该报 downloaded
    const mod = await import(DOWNLOADER)
    const list = await mod.listModels()
    expect(list.find((m: { key: string }) => m.key === 'test-model')?.status).toBe('downloaded')
  })

  it('断点续传:已有半个 .partial → Range 续传,不从 0 重下,最终 sha 命中', async () => {
    const dir = path.join(tmpDir, 'models', 'test-model')
    await fs.mkdir(dir, { recursive: true })
    // 预置前 20000 字节(与真实数据一致)
    await fs.writeFile(path.join(dir, 'data.bin.partial'), DATA.subarray(0, 20_000))

    const events = await runDownload()
    expect(events.at(-1)?.phase).toBe('done')
    const final = await fs.readFile(path.join(dir, 'data.bin'))
    expect(createHash('sha256').update(final).digest('hex')).toBe(DATA_SHA)
  })

  it('sha 不匹配 → source-switched 切下一源 → 仍能 done', async () => {
    mockEntry.sources = [
      `http://127.0.0.1:${port}/bad/{file}`,
      `http://127.0.0.1:${port}/good/{file}`,
    ]
    const events = await runDownload()
    expect(events.some((e) => e.phase === 'source-switched' && e.reason === 'checksum')).toBe(true)
    expect(events.at(-1)?.phase).toBe('done')
  })

  it('全源失败 → error(all-sources-failed)', async () => {
    mockEntry.sources = [`http://127.0.0.1:${port}/bad/{file}`]
    const events = await runDownload()
    const last = events.at(-1)
    expect(last?.phase).toBe('error')
    if (last?.phase === 'error') expect(last.code).toBe('all-sources-failed')
  })
})
