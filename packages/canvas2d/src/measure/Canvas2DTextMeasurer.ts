/**
 * Canvas2DTextMeasurer——`TextMeasurer` 接口的 Canvas2D 实现。
 *
 * 借用一个隐式构造的 OffscreenCanvas / 同进程 HTMLCanvasElement 拿 2D context，
 * 用它的 `measureText` 做文本宽度量。结果按 `font + text` 作 LRU 缓存键。
 *
 * 为什么不直接复用 painter 的 ctx：
 *   - 量度发生在 autofit 阶段（不一定有可用的 paint ctx）
 *   - 量度需要独立 font 设置，与 painter 当前 font 互不污染
 *   - 量度 ctx 不需要也不应该被画到画布上
 *
 * 缓存策略：LRU、上限 20000 条（足够覆盖典型 1M 行 × 20 visible col × 重复值场景）。
 * 缓存被 `clearCache()` 主动失效——主题 / 字段 schema 变更时由调用方调一次。
 */

import type { TextMeasurer } from '@zhiguang/novasheet-core'

const DEFAULT_CACHE_LIMIT = 20_000

/** 缓存条目：仅 text + font 同时命中才复用，避免不同字体下宽度错位。 */
interface CacheEntry {
  font: string
  text: string
  width: number
}

export class Canvas2DTextMeasurer implements TextMeasurer {
  private ctx: CanvasRenderingContext2D
  private cache = new Map<string, CacheEntry>()
  private cacheLimit: number

  constructor(cacheLimit: number = DEFAULT_CACHE_LIMIT) {
    this.cacheLimit = cacheLimit
    // 浏览器：OffscreenCanvas 优先；happy-dom 等无 OffscreenCanvas 的环境退化到 HTMLCanvasElement
    const canvas: HTMLCanvasElement | OffscreenCanvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(1, 1)
        : document.createElement('canvas')
    const ctx = (canvas as HTMLCanvasElement).getContext('2d')
    if (!ctx) {
      throw new Error('Canvas2DTextMeasurer: 2D context unavailable')
    }
    this.ctx = ctx as CanvasRenderingContext2D
  }

  measureWidth(text: string, font: string): number {
    const key = `${font}|${text}`
    const hit = this.cache.get(key)
    if (hit) {
      // LRU 命中：搬到 map 末尾
      this.cache.delete(key)
      this.cache.set(key, hit)
      return hit.width
    }
    if (this.ctx.font !== font) {
      this.ctx.font = font
    }
    const width = this.ctx.measureText(text).width
    this.cache.set(key, { font, text, width })
    if (this.cache.size > this.cacheLimit) {
      // 删除最早的 entry（Map 迭代顺序 = 插入顺序）
      const oldestKey = this.cache.keys().next().value
      if (oldestKey !== undefined) this.cache.delete(oldestKey)
    }
    return width
  }

  /** 清空缓存。主题切换 / 字体变化时调用。 */
  clearCache(): void {
    this.cache.clear()
  }

  /** 测试 / 诊断用：当前缓存条目数。 */
  getCacheSize(): number {
    return this.cache.size
  }
}
