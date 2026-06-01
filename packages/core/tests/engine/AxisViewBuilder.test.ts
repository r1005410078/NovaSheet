import { describe, expect, it } from 'bun:test'
import { AxisViewBuilder, ChunkedAxis, type Field } from '../../src'

describe('AxisViewBuilder', () => {
  it('builds a view rows axis from visible underlying rows', () => {
    const rawRowsAxis = new ChunkedAxis({ count: 5, defaultSize: 24 })
    rawRowsAxis.setSize(1, 40)
    rawRowsAxis.setSize(3, 60)

    const axis = new AxisViewBuilder().buildRowsAxis({
      rawRowsAxis,
      visibleRows: [0, 3, 1],
      defaultSize: 24,
    })

    expect(axis.getCount()).toBe(3)
    expect(axis.getDefaultSize()).toBe(24)
    expect(axis.getSize(0)).toBe(24)
    expect(axis.getSize(1)).toBe(60)
    expect(axis.getSize(2)).toBe(40)
  })

  it('builds a view cols axis from schema fields and hidden field ids', () => {
    const rawColsAxis = new ChunkedAxis({ count: 4, defaultSize: 100 })
    rawColsAxis.setSize(1, 140)
    rawColsAxis.setSize(3, 180)
    const fields: Field[] = [
      { id: 'a', name: 'A', type: 'text', width: 100 },
      { id: 'b', name: 'B', type: 'text', width: 140 },
      { id: 'c', name: 'C', type: 'text', width: 100 },
      { id: 'd', name: 'D', type: 'text', width: 180 },
    ]

    const axis = new AxisViewBuilder().buildColsAxis({
      rawColsAxis,
      fields,
      hiddenFieldIds: new Set(['b']),
    })

    expect(axis.getCount()).toBe(3)
    expect(axis.getDefaultSize()).toBe(100)
    expect(axis.getSize(0)).toBe(100)
    expect(axis.getSize(1)).toBe(100)
    expect(axis.getSize(2)).toBe(180)
  })
})
