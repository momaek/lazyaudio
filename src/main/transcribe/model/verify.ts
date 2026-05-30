// T31 — SHA256 校验(transcription-pipeline.md §5.5)。
// sha256File 流式过文件,不整个读进内存(模型 ~226MB)。

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'

/** 流式计算文件 sha256(hex) */
export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

/** 非抛版:size + sha256 都对才 true(用于「已下载?」快判,跳过重下) */
export async function fileMatches(
  filePath: string,
  expectedSha256: string,
  expectedBytes: number,
): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath)
    if (stat.size !== expectedBytes) return false
    const actual = await sha256File(filePath)
    return actual === expectedSha256
  } catch {
    return false
  }
}

export class ChecksumMismatchError extends Error {
  constructor(
    public readonly filePath: string,
    public readonly expected: string,
    public readonly actual: string,
  ) {
    super(`checksum mismatch for ${filePath}: expected ${expected}, got ${actual}`)
    this.name = 'ChecksumMismatchError'
  }
}

/** 抛版:size 不符或 sha 不符直接抛(下载完最终校验用) */
export async function verifyFile(
  filePath: string,
  expectedSha256: string,
  expectedBytes: number,
): Promise<void> {
  const stat = await fs.stat(filePath)
  if (stat.size !== expectedBytes) {
    throw new Error(`size mismatch for ${filePath}: expected ${expectedBytes}, got ${stat.size}`)
  }
  const actual = await sha256File(filePath)
  if (actual !== expectedSha256) {
    throw new ChecksumMismatchError(filePath, expectedSha256, actual)
  }
}
