import { describe, expect, it } from 'bun:test'
import { Canvas2DTextMeasurer } from '../../src/measure/Canvas2DTextMeasurer'

describe('Canvas2DTextMeasurer', () => {
  it('返回 measureText 的 width', () => {
    const m = new Canvas2DTextMeasurer()
    const w = m.measureWidth('hello', '12px sans-serif')
    // RecordingContext / happy-dom canvas 都会返回某个数；具体值取决于 stub。
    // 这里只断言 > 0 并不抛错。
    expect(typeof w).toBe('number')
    expect(w).toBeGreaterThanOrEqual(0)
  })

  it('同 font + text 走缓存（多次调用宽度一致）', () => {
    const m = new Canvas2DTextMeasurer()
    const w1 = m.measureWidth('hello', '12px sans-serif')
    const w2 = m.measureWidth('hello', '12px sans-serif')
    expect(w1).toBe(w2)
    expect(m.getCacheSize()).toBe(1)
  })

  it('不同 font 缓存独立', () => {
    const m = new Canvas2DTextMeasurer()
    m.measureWidth('hello', '12px sans-serif')
    m.measureWidth('hello', '14px sans-serif')
    expect(m.getCacheSize()).toBe(2)
  })

  it('clearCache 后大小为 0', () => {
    const m = new Canvas2DTextMeasurer()
    m.measureWidth('hello', '12px sans-serif')
    m.clearCache()
    expect(m.getCacheSize()).toBe(0)
  })

  it('达到 cacheLimit 时驱逐最早项', () => {
    const m = new Canvas2DTextMeasurer(3)
    m.measureWidth('a', '12px x')
    m.measureWidth('b', '12px x')
    m.measureWidth('c', '12px x')
    expect(m.getCacheSize()).toBe(3)
    m.measureWidth('d', '12px x')
    expect(m.getCacheSize()).toBe(3) // 仍为 3，最早的 'a' 已被踢出
  })
})
