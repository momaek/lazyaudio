// T12 — AudioWorklet PCM extractor
// 跑在 audio render thread(非主 JS 线程),把 Float32 PCM 累积到 100ms 帧后
// 转成 Int16 通过 port 发回主线程。audio-capture §3.3 / §3.4 设计。
//
// 关键:
// - 每 process 调用拿 1 block = 128 frames(标准固定,与 AudioContext sampleRate 无关)
// - 累计到 4800 frames(100ms @ 48kHz)再发一帧;太小 IPC 频繁,太大尾部丢得多
// - Float32 → Int16 在这里转,IPC 字节数减半
// - 同时算 RMS(电平表用,T11 暂不消费 — 留前向兼容)
// - 多声道(system 是 stereo): interleave 后发,channel count 在 track-open 时声明
//
// 输出消息 schema(发到主线程 AudioWorkletNode.port):
//   { type: 'chunk', pcm: ArrayBuffer (Int16), frames, channels, rms, ts }
//   主线程接到后再加 recordingId/trackId/seq 包装成 messages.ts 的 Chunk 发到 main 进程

const FRAMES_PER_CHUNK = 4800 // 100ms @ 48kHz

function f32ToI16Inline(f32: Float32Array, out: Int16Array): void {
  for (let i = 0; i < f32.length; i++) {
    const v = f32[i] ?? 0
    const s = Math.max(-1, Math.min(1, v))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
}

class PCMTap extends AudioWorkletProcessor {
  // 单声道 buffer(mic) 或者 interleaved stereo(system) 的累计
  private buffer: Float32Array = new Float32Array(0)
  private channels = 1
  private samplesInBuffer = 0 // frames(每 frame 含 channels 个 sample)

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]
    if (!input || input.length === 0 || !input[0] || input[0].length === 0) {
      return true
    }
    const blockFrames = input[0].length
    const inCh = input.length

    // 首次拿到 input 时确定 channels(根据真实 input 通道数,而非 worklet options)
    if (this.samplesInBuffer === 0 && this.channels !== inCh) {
      this.channels = inCh
      this.buffer = new Float32Array(FRAMES_PER_CHUNK * this.channels)
    }

    // 写入 buffer(interleave)
    for (let f = 0; f < blockFrames; f++) {
      const off = (this.samplesInBuffer + f) * this.channels
      for (let c = 0; c < this.channels; c++) {
        // 防御:某些 input 路 channel 数不一致时 take 0
        const chSrc = input[c] ?? input[0]
        this.buffer[off + c] = chSrc[f] ?? 0
      }
    }
    this.samplesInBuffer += blockFrames

    // 攒满 100ms 帧就发
    while (this.samplesInBuffer >= FRAMES_PER_CHUNK) {
      const frames = FRAMES_PER_CHUNK
      const samples = frames * this.channels
      const slice = this.buffer.subarray(0, samples)

      // RMS(用 Float32 算精度高一点;按全 sample 算,不分 channel — 电平表只要一个数)
      let sumSq = 0
      for (let i = 0; i < samples; i++) {
        const v = slice[i] ?? 0
        sumSq += v * v
      }
      const rms = Math.sqrt(sumSq / samples)

      // 转 Int16
      const i16Buf = new ArrayBuffer(samples * 2)
      const i16View = new Int16Array(i16Buf)
      f32ToI16Inline(slice, i16View)

      this.port.postMessage(
        {
          type: 'chunk',
          pcm: i16Buf,
          frames,
          channels: this.channels,
          rms,
          ts: currentTime, // AudioWorklet 全局,秒
        },
        [i16Buf],
      )

      // 滚动 buffer(把剩余样本搬到开头)
      const remaining = this.samplesInBuffer - frames
      this.buffer.copyWithin(0, samples)
      this.samplesInBuffer = remaining
    }

    return true
  }
}

registerProcessor('pcm-tap', PCMTap)
