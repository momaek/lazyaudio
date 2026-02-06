/**
 * 通用格式化工具函数
 */

/**
 * 格式化相对时间
 * 将 ISO 时间字符串转换为相对时间描述（如"今天 14:30"、"昨天 09:00"、"3天前"）
 */
export function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return `今天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
  } else if (diffDays === 1) {
    return `昨天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
  } else if (diffDays < 7) {
    return `${diffDays}天前`
  } else {
    return `${date.getMonth() + 1}月${date.getDate()}日`
  }
}

/**
 * 格式化毫秒时长为可读字符串
 * @param ms 毫秒数
 * @returns 格式化字符串，如 "1:23:45" 或 "23:45"
 */
export function formatDurationFromMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  return formatDurationFromSeconds(totalSeconds)
}

/**
 * 格式化秒数时长为可读字符串
 * @param totalSeconds 总秒数
 * @param padMinutes 是否对分钟补零，默认 true
 * @returns 格式化字符串，如 "01:23:45" 或 "23:45"
 */
export function formatDurationFromSeconds(totalSeconds: number, padMinutes = true): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }
  if (padMinutes) {
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/**
 * 格式化日期时间为本地化字符串
 * @param isoString ISO 时间字符串
 * @returns 如 "2026-01-06 14:30"
 */
export function formatDateTime(isoString: string): string {
  const date = new Date(isoString)
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}
