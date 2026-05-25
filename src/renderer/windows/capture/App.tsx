// T12 — Capture window 的 headless React 组件
//
// 不显示任何 UI(window 1×1 hidden);只挂 useEffect lifecycle 做:
// 1. 监听 preload 通过 window.postMessage 转发的 audio-port → 拿到 MessagePort
// 2. 订阅 main 发的 audio:start-capture / audio:stop-capture 信令
// 3. 收到 start → 调 capture.ts 启 capture(PCM 通过 port 推回 main)
// 4. 收到 stop → 调 capture.ts 停 capture
//
// 不放 React state — 只有副作用;调度状态在 capture.ts 模块级 activeSession 持有

import { useEffect } from 'react'
import { startCapture, stopCapture } from '@/audio/capture'

type PortLike = {
  postMessage: (msg: unknown, transfer?: Transferable[]) => void
}

export function App(): React.JSX.Element {
  useEffect(() => {
    let port: MessagePort | null = null
    const pending: Array<{
      args: { recordingId: string; sources: { mic: boolean; system: boolean } }
    }> = []

    // 1. 接收 preload 转发的 audio-port
    const onWinMessage = (e: MessageEvent): void => {
      if (e.data !== 'audio-port') return
      const got = e.ports[0]
      if (!got) {
        console.error('[capture] audio-port event but no ports')
        return
      }
      port = got
      port.onmessage = (msg) => {
        // T12 收到 main 的 writer-ack;暂不消费(future 接背压检测)
        const data = msg.data as { type?: string } | undefined
        if (data?.type === 'writer-ack') {
          // T12 暂不消费(背压检测留 T13);保留 info log 让 dev mode 看得到回执
          console.info('[capture] writer-ack', data)
        }
      }
      port.start()
      console.info('[capture] audio-port received from preload')

      // 之前 queued 的 start 请求重放
      for (const p of pending) void runStart(p.args)
      pending.length = 0
    }
    window.addEventListener('message', onWinMessage)

    async function runStart(args: {
      recordingId: string
      sources: { mic: boolean; system: boolean }
    }): Promise<void> {
      if (!port) {
        console.warn('[capture] start before port ready, queueing', args)
        pending.push({ args })
        return
      }
      try {
        await startCapture({
          recordingId: args.recordingId,
          sources: args.sources,
          port: port as PortLike,
        })
      } catch (e) {
        console.error('[capture] startCapture FAILED', e)
        // 反馈 main(通过 port 发 track-close error 让 receiver 知道)
        if (port) {
          port.postMessage({
            type: 'track-close',
            recordingId: args.recordingId,
            trackId: 'mic',
            reason: 'error',
            error: String(e),
          })
        }
      }
    }

    // 2/3. 订阅 main 的 start / stop 信令
    const offStart = window.lazyaudio.audio.onStartCapture((args) => {
      console.info('[capture] audio:start-capture received', args)
      void runStart(args)
    })
    const offStop = window.lazyaudio.audio.onStopCapture((args) => {
      console.info('[capture] audio:stop-capture received', args)
      void stopCapture()
    })

    return () => {
      window.removeEventListener('message', onWinMessage)
      offStart()
      offStop()
      void stopCapture()
    }
  }, [])

  // window 1×1 hidden,任何 DOM 都看不见;留一个标识方便 devtools 识别
  return <div data-window="capture" />
}
