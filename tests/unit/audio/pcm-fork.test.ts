// T34 — pcm-fork 单测:track-open 声明的真实通道数要透传到下混。
import { beforeEach, describe, expect, it, vi } from 'vitest'

const live = vi.hoisted(() => ({
  active: true,
  pushed: [] as Int16Array[],
}))

vi.mock('../../../src/main/transcribe/orchestrator', () => ({
  isLiveActive: () => live.active,
  pushLivePcm: (_recordingId: string, int16: Int16Array) => live.pushed.push(int16),
}))

describe('pcm-fork', () => {
  beforeEach(() => {
    live.active = true
    live.pushed = []
    vi.resetModules()
  })

  it('按 track-open 声明的 mic 通道数下混,避免双声道麦克风被当成单声道导致时间轴膨胀', async () => {
    const { startPcmFork, stopPcmFork, registerPcmTrack, forkPcm } =
      await import('../../../src/main/audio/pcm-fork')

    startPcmFork('rec-1', { mic: true, system: false })
    registerPcmTrack('rec-1', 'mic', 2)

    // 480 stereo frames @ 48k → 160 mono samples @ 16k。
    // 若错误按 1ch 解释,会变成 320 samples。
    const pcm = new Int16Array(480 * 2)
    for (let i = 0; i < pcm.length; i += 2) {
      pcm[i] = 32767
      pcm[i + 1] = 32767
    }

    forkPcm('rec-1', 'mic', pcm.buffer)

    expect(live.pushed).toHaveLength(1)
    expect(live.pushed[0]!.length).toBe(160)
    expect(live.pushed[0]![0]).toBeGreaterThan(30000)

    stopPcmFork('rec-1')
  })

  it('未收到 track-open 通道数时不喂实时 ASR', async () => {
    const { startPcmFork, forkPcm } = await import('../../../src/main/audio/pcm-fork')

    startPcmFork('rec-1', { mic: true, system: false })
    forkPcm('rec-1', 'mic', new Int16Array(480).buffer)

    expect(live.pushed).toHaveLength(0)
  })
})
