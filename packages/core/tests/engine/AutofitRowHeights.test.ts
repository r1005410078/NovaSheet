import { describe, expect, it } from 'bun:test'
import {
  autofitRowHeights,
  denseGridTheme,
  InMemoryDataSource,
  type Schema,
  type TextMeasurer,
} from '../../src'

const fixedWidthMeasurer: TextMeasurer = {
  measureWidth: (text) => text.length * 7,
}

const WRAP_SCHEMA: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 100 },
    { id: 'desc', name: 'Description', type: 'text', width: 100, wrap: true },
    { id: 'amount', name: 'Amount', type: 'number', width: 80, wrap: true /* 被忽略 */ },
  ],
}

const NO_WRAP_SCHEMA: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 100 },
    { id: 'desc', name: 'Description', type: 'text', width: 100 },
  ],
}

describe('autofitRowHeights', () => {
  it('schema 中无 wrap 字段时所有行被 skipped', () => {
    const data = new InMemoryDataSource({
      schema: NO_WRAP_SCHEMA,
      rows: [
        { name: 'a', desc: 'short' },
        { name: 'b', desc: 'short too' },
      ],
    })
    const heights: Record<number, number> = {}
    const result = autofitRowHeights({
      data,
      theme: denseGridTheme,
      measurer: fixedWidthMeasurer,
      applyHeight: (r, h) => {
        heights[r] = h
      },
    })
    expect(result.changedRows).toBe(0)
    expect(result.skippedRows).toBe(2)
    expect(Object.keys(heights).length).toBe(0)
  })

  it('单行短文本：用最小行高（theme.metrics.rowHeight）', () => {
    const data = new InMemoryDataSource({
      schema: WRAP_SCHEMA,
      rows: [{ name: 'a', desc: 'short', amount: 100 }],
    })
    const heights: Record<number, number> = {}
    const result = autofitRowHeights({
      data,
      theme: denseGridTheme,
      measurer: fixedWidthMeasurer,
      applyHeight: (r, h) => {
        heights[r] = h
      },
    })
    expect(result.changedRows).toBe(1)
    expect(heights[0]).toBe(denseGridTheme.metrics.rowHeight)
  })

  it('长文本：行高随 wrap 行数线性增长', () => {
    const data = new InMemoryDataSource({
      schema: WRAP_SCHEMA,
      rows: [
        { name: 'a', desc: 'short' }, // 1 行
        { name: 'b', desc: 'aaaaaaaa bbbbbbbb cccccccc dddddddd' }, // 多行
      ],
    })
    const heights: Record<number, number> = {}
    autofitRowHeights({
      data,
      theme: denseGridTheme,
      measurer: fixedWidthMeasurer,
      applyHeight: (r, h) => {
        heights[r] = h
      },
    })
    expect(heights[1]).toBeGreaterThan(heights[0]!)
  })

  it('number 字段即使 wrap=true 也不参与高度计算', () => {
    // 一份只有 amount(number, wrap=true)、没有 desc 的 schema
    const numOnlySchema: Schema = {
      fields: [{ id: 'amount', name: 'A', type: 'number', width: 100, wrap: true }],
    }
    const data = new InMemoryDataSource({
      schema: numOnlySchema,
      rows: [{ amount: 12345 }],
    })
    const heights: Record<number, number> = {}
    const result = autofitRowHeights({
      data,
      theme: denseGridTheme,
      measurer: fixedWidthMeasurer,
      applyHeight: (r, h) => {
        heights[r] = h
      },
    })
    // 没有 wrap 字段（number 被滤掉）→ 全 skip
    expect(result.changedRows).toBe(0)
    expect(result.skippedRows).toBe(1)
  })

  it('rows 选项只 autofit 指定行', () => {
    const data = new InMemoryDataSource({
      schema: WRAP_SCHEMA,
      rows: Array.from({ length: 5 }, (_, i) => ({ name: `r${i}`, desc: 'short' })),
    })
    const heights: Record<number, number> = {}
    const result = autofitRowHeights({
      data,
      theme: denseGridTheme,
      measurer: fixedWidthMeasurer,
      applyHeight: (r, h) => {
        heights[r] = h
      },
      rows: [1, 3],
    })
    expect(result.changedRows).toBe(2)
    expect(heights[0]).toBeUndefined()
    expect(heights[1]).toBeDefined()
    expect(heights[3]).toBeDefined()
  })

  it('maxHeight 上限被尊重', () => {
    // 巨长文本，maxHeight=40 应当被截断
    const longText = 'a'.repeat(500)
    const data = new InMemoryDataSource({
      schema: WRAP_SCHEMA,
      rows: [{ name: 'r', desc: longText }],
    })
    const heights: Record<number, number> = {}
    autofitRowHeights({
      data,
      theme: denseGridTheme,
      measurer: fixedWidthMeasurer,
      applyHeight: (r, h) => {
        heights[r] = h
      },
      maxHeight: 40,
    })
    expect(heights[0]).toBe(40)
  })

  it('out-of-range row 进 skippedRows，不调 applyHeight', () => {
    const data = new InMemoryDataSource({
      schema: WRAP_SCHEMA,
      rows: [{ name: 'a', desc: 'short' }],
    })
    const calls: Array<[number, number]> = []
    const result = autofitRowHeights({
      data,
      theme: denseGridTheme,
      measurer: fixedWidthMeasurer,
      applyHeight: (r, h) => calls.push([r, h]),
      rows: [-1, 0, 99],
    })
    expect(result.changedRows).toBe(1)
    expect(result.skippedRows).toBe(2)
    expect(calls.length).toBe(1)
    expect(calls[0]![0]).toBe(0)
  })

  it('全是 null/undefined value 的行被 skipped', () => {
    const data = new InMemoryDataSource({
      schema: WRAP_SCHEMA,
      rows: [{ name: 'a', desc: null }],
    })
    const heights: Record<number, number> = {}
    const result = autofitRowHeights({
      data,
      theme: denseGridTheme,
      measurer: fixedWidthMeasurer,
      applyHeight: (r, h) => {
        heights[r] = h
      },
    })
    expect(result.changedRows).toBe(0)
    expect(result.skippedRows).toBe(1)
  })

  describe('硬换行（\\n）撑高，不依赖 wrap', () => {
    it('非 wrap 列含 \\n 的行按行数撑高', () => {
      const data = new InMemoryDataSource({
        schema: NO_WRAP_SCHEMA,
        rows: [{ name: 'one\ntwo\nthree', desc: 'x' }],
      })
      const heights: Record<number, number> = {}
      const result = autofitRowHeights({
        data,
        theme: denseGridTheme,
        measurer: fixedWidthMeasurer,
        applyHeight: (r, h) => {
          heights[r] = h
        },
      })
      expect(result.changedRows).toBe(1)
      // 3 行 × (12×1.4) + padY×2 = 50.4 + 8 ≈ 59，远大于默认 28
      expect(heights[0]).toBeGreaterThan(denseGridTheme.metrics.rowHeight)
      expect(heights[0]).toBeGreaterThan(50)
    })

    it('合并格（isCellMerged 命中）不参与撑高', () => {
      const data = new InMemoryDataSource({
        schema: NO_WRAP_SCHEMA,
        rows: [{ name: 'a\nb\nc\nd', desc: 'x' }],
      })
      const heights: Record<number, number> = {}
      const result = autofitRowHeights({
        data,
        theme: denseGridTheme,
        measurer: fixedWidthMeasurer,
        applyHeight: (r, h) => {
          heights[r] = h
        },
        isCellMerged: (_row, colIndex) => colIndex === 0, // name 列视为合并
      })
      expect(result.changedRows).toBe(0) // 唯一多行格被合并排除 → 不撑高
      expect(result.skippedRows).toBe(1)
    })
  })

  describe('isWrapCell 取代 field.wrap 决定软折撑高', () => {
    const longText = 'aaaaaaaaaaaaaaaaaaaaaaaa' // 24 字符，宽 100 列必折行

    it('非 wrap 列但 isWrapCell=true → 软折撑高', () => {
      const data = new InMemoryDataSource({
        schema: NO_WRAP_SCHEMA,
        rows: [{ name: longText, desc: 'x' }],
      })
      const heights: Record<number, number> = {}
      autofitRowHeights({
        data,
        theme: denseGridTheme,
        measurer: fixedWidthMeasurer,
        applyHeight: (r, h) => {
          heights[r] = h
        },
        isWrapCell: (_row, colIndex) => colIndex === 0,
      })
      expect(heights[0]).toBeGreaterThan(denseGridTheme.metrics.rowHeight)
    })

    it('field.wrap 列但 isWrapCell=false（如 textWrap=overflow）→ 不软折撑高', () => {
      const data = new InMemoryDataSource({
        schema: WRAP_SCHEMA, // desc 列 wrap=true
        rows: [{ name: 'a', desc: longText, amount: 1 }],
      })
      const heights: Record<number, number> = {}
      const result = autofitRowHeights({
        data,
        theme: denseGridTheme,
        measurer: fixedWidthMeasurer,
        applyHeight: (r, h) => {
          heights[r] = h
        },
        isWrapCell: () => false, // 全部按 overflow，无软折
      })
      expect(result.changedRows).toBe(0)
    })
  })
})
