import fs from 'node:fs/promises'

const HEADER_SIZE = 44
const PCM_FORMAT = 1

export interface WavHeaderInfo {
  sampleRate: number
  channels: number
  bitDepth: number
  dataBytes: number
  durationMs: number
}

function makeSizeBuffer(value: number): Buffer {
  const buf = Buffer.alloc(4)
  buf.writeUInt32LE(value, 0)
  return buf
}

export function parseWavHeader(header: Buffer, fileSize: number): WavHeaderInfo | null {
  if (fileSize < HEADER_SIZE) return null
  if (header.length < HEADER_SIZE) return null
  if (header.subarray(0, 4).toString('ascii') !== 'RIFF') return null
  if (header.subarray(8, 12).toString('ascii') !== 'WAVE') return null
  if (header.subarray(12, 16).toString('ascii') !== 'fmt ') return null
  if (header.subarray(36, 40).toString('ascii') !== 'data') return null

  const audioFormat = header.readUInt16LE(20)
  if (audioFormat !== PCM_FORMAT) return null

  const channels = header.readUInt16LE(22)
  const sampleRate = header.readUInt32LE(24)
  const bitDepth = header.readUInt16LE(34)
  if (channels <= 0 || sampleRate <= 0 || bitDepth <= 0) return null

  const frameBytes = channels * (bitDepth / 8)
  if (!Number.isInteger(frameBytes) || frameBytes <= 0) return null

  const rawDataBytes = Math.max(0, fileSize - HEADER_SIZE)
  const dataBytes = rawDataBytes - (rawDataBytes % frameBytes)
  const frames = dataBytes / frameBytes
  const durationMs = Math.floor((frames / sampleRate) * 1000)

  return { sampleRate, channels, bitDepth, dataBytes, durationMs }
}

export async function inspectWavFile(filePath: string): Promise<WavHeaderInfo | null> {
  let handle: fs.FileHandle | undefined
  try {
    handle = await fs.open(filePath, 'r')
    const stat = await handle.stat()
    const header = Buffer.alloc(HEADER_SIZE)
    await handle.read(header, 0, HEADER_SIZE, 0)
    return parseWavHeader(header, stat.size)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  } finally {
    if (handle) await handle.close().catch(() => {})
  }
}

export async function repairWavHeader(filePath: string): Promise<WavHeaderInfo | null> {
  let handle: fs.FileHandle | undefined
  try {
    handle = await fs.open(filePath, 'r+')
    const stat = await handle.stat()
    const header = Buffer.alloc(HEADER_SIZE)
    await handle.read(header, 0, HEADER_SIZE, 0)
    const info = parseWavHeader(header, stat.size)
    if (!info) return null

    await handle.write(makeSizeBuffer(36 + info.dataBytes), 0, 4, 4)
    await handle.write(makeSizeBuffer(info.dataBytes), 0, 4, 40)
    return info
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  } finally {
    if (handle) await handle.close().catch(() => {})
  }
}
