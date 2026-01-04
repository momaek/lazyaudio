import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * 合并 Tailwind CSS 类名
 * 用于处理条件类名和覆盖
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

