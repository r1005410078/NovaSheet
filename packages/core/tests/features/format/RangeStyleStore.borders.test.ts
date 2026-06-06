import { describe, expect, it } from 'bun:test'
import { RangeStyleStore } from '../../../src/features/format/RangeStyleStore'
import type { BorderStyle } from '../../../src/kernel/protocol/FormatTypes'
import { asRawRange } from '../../../src/kernel/coords/coordinates'

const border: BorderStyle = { color: '#000', width: 'thin', lineStyle: 'solid' }
const r = (startRow: number, endRow: number, startCol: number, endCol: number) =>
  asRawRange({ startRow, endRow, startCol, endCol })

describe('RangeStyleStore — applyBorders 单层化', () => {
  it('多格 applyBorders 只产生一层', () => {
    const store = new RangeStyleStore()
    store.applyBorders(r(0, 2, 0, 2), 'all', border)
    expect(store.getLayerCount()).toBe(1)
  })

  it("'all' preset 每格四边都解析出边框", () => {
    const store = new RangeStyleStore()
    store.applyBorders(r(0, 2, 0, 2), 'all', border)
    const mid = store.resolveCell(1, 1)
    expect(mid?.borders).toEqual({ top: border, right: border, bottom: border, left: border })
  })

  it("'outer' preset 仅边缘格解析出对应边", () => {
    const store = new RangeStyleStore()
    store.applyBorders(r(0, 2, 0, 2), 'outer', border)
    expect(store.resolveCell(0, 0)?.borders).toEqual({ top: border, left: border })
    expect(store.resolveCell(1, 1)).toBeUndefined()
    expect(store.resolveCell(2, 2)?.borders).toEqual({ bottom: border, right: border })
  })

  it('单层 border 与填充叠加共存', () => {
    const store = new RangeStyleStore()
    store.apply(r(0, 0, 0, 0), { fillColor: '#f00' })
    store.applyBorders(r(0, 0, 0, 0), 'all', border)
    const cell = store.resolveCell(0, 0)
    expect(cell?.fillColor).toBe('#f00')
    expect(cell?.borders).toEqual({ top: border, right: border, bottom: border, left: border })
  })

  it('snapshot/restore round-trip 后单层 border 仍正确', () => {
    const store = new RangeStyleStore()
    store.applyBorders(r(0, 1, 0, 1), 'all', border)
    const snap = store.snapshot()
    const restored = new RangeStyleStore()
    restored.restore(snap)
    expect(restored.getLayerCount()).toBe(1)
    expect(restored.resolveCell(0, 0)?.borders).toEqual({
      top: border,
      right: border,
      bottom: border,
      left: border,
    })
  })

  it('clearBorders 清除单层 border', () => {
    const store = new RangeStyleStore()
    store.applyBorders(r(0, 1, 0, 1), 'all', border)
    store.clearBorders(r(0, 1, 0, 1))
    expect(store.resolveCell(0, 0)).toBeUndefined()
  })

  it('结构 remap 平移单层 range 后边缘按新位置解析', () => {
    const store = new RangeStyleStore()
    store.applyBorders(r(0, 2, 0, 2), 'outer', border)
    store.remapAfterRowsInserted(0, 2) // range 行区间 0..2 → 2..4
    expect(store.resolveCell(0, 0)).toBeUndefined() // 原左上角已不在 range
    expect(store.resolveCell(2, 0)?.borders).toEqual({ top: border, left: border }) // 新左上角
    expect(store.resolveCell(4, 2)?.borders).toEqual({ bottom: border, right: border }) // 新右下角
    expect(store.resolveCell(3, 1)).toBeUndefined() // 新内部
  })
})
