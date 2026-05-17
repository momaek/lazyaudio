// record domain IPC handlers — T04 阶段占位,T11/T13 填实际逻辑。
// 现在 register() 不挂任何 handler;CHANNEL 在 shared/ipc/record.ts 已 reserve。
export function register(): void {
  // T11 起接通:record:start / pause / resume / stop / tick / state-changed
}
