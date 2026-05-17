// dev-only schema assert,用于 main 内部 / main → renderer 事件:
// renderer → main 的 IPC args 必须用 schema.parse(throws),那是不可信输入边界(coding-conventions §5.2)。
// 自己出去的 / 自己消费的数据用本 helper:dev 强校验,prod skip。
import type { z } from 'zod'

export function assertSchemaDev<T>(schema: z.ZodType<T>, value: unknown): void {
  // 主进程 tsconfig 不引 vite/client(避免 DOM 类型污染),改走 NODE_ENV 兜底。
  // dev / unpackaged 都视为 dev,prod packaged 由 electron-builder 注入 NODE_ENV=production。
  if (process.env['NODE_ENV'] === 'production') return
  const r = schema.safeParse(value)
  if (!r.success) {
    throw new Error(`schema mismatch:${r.error.message}`)
  }
}
