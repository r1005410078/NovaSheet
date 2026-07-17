import { describe, expect, it } from 'bun:test'
import { denseGridTheme } from '@zhiguang/core'
import { CellPainter } from '../../src/painters/CellPainter'
import { createRecordingContext } from '../helpers/recording-context'

describe('CellPainter — truncationCache 上限', () => {
  it('唯一字符串超过 8192 条时缓存被整体清空重建，不无界增长', () => {
    const { ctx } = createRecordingContext()
    const painter = new CellPainter(denseGridTheme)
    const rect = { x: 0, y: 0, width: 40, height: 24 } // 窄列强制截断入缓存
    const field = { id: 'f', name: 'F', type: 'text' as const, width: 40 }

    for (let i = 0; i < 9000; i++) {
      painter.paint(ctx, {
        value: `unique-value-${i}-${'x'.repeat(20)}`,
        rect,
        field,
        rowIndex: 0,
        colIndex: 0,
      })
    }

    const cache = (painter as unknown as { truncationCache: Map<string, string> }).truncationCache
    // clear() 在 insert 8193 处触发，剩余 9000 - 8192 = 808 条
    expect(cache.size).toBe(808)
    expect(cache.size).toBeLessThanOrEqual(8192)
  })
})
