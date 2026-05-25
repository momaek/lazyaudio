// T12 — main 端管 MessageChannelMain 生命周期。
//
// 时序(audio-capture §4.2 + ipc-contract §2.3):
// 1. capture window did-finish-load 后,main 建 MessageChannelMain
// 2. main 把 port2 通过 webContents.postMessage('audio-port', null, [port2]) 推给 capture renderer
// 3. main 留 port1 给 audio receiver 监听
// 4. 后续 PCM 流走这对 port,不走 ipcMain.send/invoke(transferable + 零拷贝)
//
// 重启:capture renderer 崩溃 / 重 load 时,port 失效,要重建。didFinishLoad 监听一次性
// 不够,改成监听 'did-finish-load' 事件(多次触发)。T12 阶段 capture window 不刷新,先一次性。

import { MessageChannelMain, type MessagePortMain, type WebContents } from 'electron'
import { AUDIO } from '@shared/ipc/channels'
import { logger } from '../logger'

let currentPort: MessagePortMain | null = null
let portConsumers: Array<(port: MessagePortMain) => void> = []

/**
 * capture window did-finish-load 后调一次:建 channel + 推 port2 + 把 port1 交给消费者。
 */
export function setupAudioPort(captureWebContents: WebContents): void {
  // 拆旧 port(防 hot reload 时残留)
  if (currentPort) {
    currentPort.close()
    currentPort = null
  }

  const { port1, port2 } = new MessageChannelMain()
  currentPort = port1
  port1.start()

  captureWebContents.postMessage(AUDIO.port, null, [port2])
  logger.info('audio port: posted port2 to capture window')

  // 通知所有注册过的消费者(主要是 receiver)
  for (const consumer of portConsumers) {
    consumer(port1)
  }
}

/**
 * receiver 启动时注册自己;后续每次 setupAudioPort 都会重新喂 port 给它。
 */
export function onAudioPortReady(consumer: (port: MessagePortMain) => void): void {
  portConsumers.push(consumer)
  if (currentPort) consumer(currentPort)
}

export function teardownAudioPort(): void {
  if (currentPort) {
    currentPort.close()
    currentPort = null
  }
  portConsumers = []
}
