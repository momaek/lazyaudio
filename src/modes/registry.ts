import type { ModeDefinition, ModeType } from './types'

/**
 * Mode 注册表
 * 管理所有 Mode 的注册、查询和生命周期
 */
class ModeRegistry {
  private modes: Map<string, ModeDefinition> = new Map()

  /**
   * 注册一个 Mode
   */
  register(mode: ModeDefinition): void {
    if (this.modes.has(mode.id)) {
      console.warn(`[ModeRegistry] Mode "${mode.id}" 已存在，将被覆盖`)
    }
    this.modes.set(mode.id, mode)
    console.log(`[ModeRegistry] 注册 Mode: ${mode.id}`)
  }

  /**
   * 注销一个 Mode
   */
  unregister(modeId: string): void {
    if (this.modes.delete(modeId)) {
      console.log(`[ModeRegistry] 注销 Mode: ${modeId}`)
    }
  }

  /**
   * 获取 Mode 定义
   */
  get(modeId: string): ModeDefinition | undefined {
    return this.modes.get(modeId)
  }

  /**
   * 检查 Mode 是否存在
   */
  has(modeId: string): boolean {
    return this.modes.has(modeId)
  }

  /**
   * 获取所有 Mode
   */
  list(): ModeDefinition[] {
    return Array.from(this.modes.values())
  }

  /**
   * 按类型获取 Mode 列表
   */
  listByType(type: ModeType): ModeDefinition[] {
    return this.list().filter(mode => mode.type === type)
  }

  /**
   * 获取所有主模式
   */
  listPrimaryModes(): ModeDefinition[] {
    return this.listByType('primary')
  }

  /**
   * 获取所有叠加模式
   */
  listOverlayModes(): ModeDefinition[] {
    return this.listByType('overlay')
  }
}

// 导出单例
export const modeRegistry = new ModeRegistry()

