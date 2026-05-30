// T31 — verify.ts 单测:sha256File / fileMatches / verifyFile。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import {
  sha256File,
  fileMatches,
  verifyFile,
  ChecksumMismatchError,
} from '../../../../src/main/transcribe/model/verify'

let tmpDir: string
let filePath: string
const DATA = Buffer.from('the quick brown fox jumps over the lazy audio\n'.repeat(1000))
const SHA = createHash('sha256').update(DATA).digest('hex')

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lazyaudio-verify-'))
  filePath = path.join(tmpDir, 'data.bin')
  await fs.writeFile(filePath, DATA)
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('verify', () => {
  it('sha256File 命中 crypto 计算值', async () => {
    expect(await sha256File(filePath)).toBe(SHA)
  })

  it('fileMatches:size + sha 都对 → true', async () => {
    expect(await fileMatches(filePath, SHA, DATA.length)).toBe(true)
  })

  it('fileMatches:size 不符 → false', async () => {
    expect(await fileMatches(filePath, SHA, DATA.length + 1)).toBe(false)
  })

  it('fileMatches:sha 不符 → false', async () => {
    expect(await fileMatches(filePath, 'deadbeef', DATA.length)).toBe(false)
  })

  it('fileMatches:文件不存在 → false(不抛)', async () => {
    expect(await fileMatches(path.join(tmpDir, 'nope'), SHA, 1)).toBe(false)
  })

  it('verifyFile:全对 → 不抛', async () => {
    await expect(verifyFile(filePath, SHA, DATA.length)).resolves.toBeUndefined()
  })

  it('verifyFile:size 不符 → 抛', async () => {
    await expect(verifyFile(filePath, SHA, 1)).rejects.toThrow(/size mismatch/)
  })

  it('verifyFile:sha 不符 → 抛 ChecksumMismatchError', async () => {
    await expect(verifyFile(filePath, 'deadbeef', DATA.length)).rejects.toBeInstanceOf(
      ChecksumMismatchError,
    )
  })
})
