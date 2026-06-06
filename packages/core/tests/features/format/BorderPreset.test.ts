import { describe, expect, it } from 'bun:test'
import { borderPatchForCell } from '../../../src/features/format/BorderPreset'
import { RangeStyleStore } from '../../../src/features/format/RangeStyleStore'
import type { BorderStyle } from '../../../src/features/format/CellFormat'
import { asRawRange } from '../../../src/kernel/coords/coordinates'

const red: BorderStyle = { color: '#d93025', width: 'thin', lineStyle: 'solid' }
const range = { startRow: 1, endRow: 3, startCol: 2, endCol: 4 }

describe('borderPatchForCell', () => {
  it('applies outer borders only to range perimeter', () => {
    expect(borderPatchForCell(range, 1, 3, 'outer', red)).toEqual({ top: red })
    expect(borderPatchForCell(range, 2, 2, 'outer', red)).toEqual({ left: red })
    expect(borderPatchForCell(range, 2, 3, 'outer', red)).toEqual({})
    expect(borderPatchForCell(range, 3, 4, 'outer', red)).toEqual({ right: red, bottom: red })
  })

  it('applies inner borders only between cells', () => {
    expect(borderPatchForCell(range, 1, 2, 'inner', red)).toEqual({ right: red, bottom: red })
    expect(borderPatchForCell(range, 3, 4, 'inner', red)).toEqual({})
  })

  it('applies inner horizontal and vertical borders independently', () => {
    expect(borderPatchForCell(range, 1, 2, 'innerHorizontal', red)).toEqual({ bottom: red })
    expect(borderPatchForCell(range, 3, 2, 'innerHorizontal', red)).toEqual({})
    expect(borderPatchForCell(range, 1, 2, 'innerVertical', red)).toEqual({ right: red })
    expect(borderPatchForCell(range, 1, 4, 'innerVertical', red)).toEqual({})
  })

  it('applies single-side borders only to the selected range perimeter', () => {
    expect(borderPatchForCell(range, 1, 3, 'top', red)).toEqual({ top: red })
    expect(borderPatchForCell(range, 2, 3, 'top', red)).toEqual({})
    expect(borderPatchForCell(range, 3, 3, 'bottom', red)).toEqual({ bottom: red })
    expect(borderPatchForCell(range, 2, 3, 'bottom', red)).toEqual({})
    expect(borderPatchForCell(range, 2, 2, 'left', red)).toEqual({ left: red })
    expect(borderPatchForCell(range, 2, 3, 'left', red)).toEqual({})
    expect(borderPatchForCell(range, 2, 4, 'right', red)).toEqual({ right: red })
    expect(borderPatchForCell(range, 2, 3, 'right', red)).toEqual({})
  })

  it('applies all borders to every edge', () => {
    expect(borderPatchForCell(range, 2, 3, 'all', red)).toEqual({
      top: red,
      right: red,
      bottom: red,
      left: red,
    })
  })
})

describe('RangeStyleStore border methods', () => {
  it('applyBorders outer then resolveCell shows perimeter on corner, nothing on interior', () => {
    const store = new RangeStyleStore()
    const smallRange = asRawRange({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 })

    store.applyBorders(smallRange, 'outer', red)

    // corner cell: should have top + left
    const cornerFmt = store.resolveCell(0, 0)
    expect(cornerFmt?.borders?.top).toEqual(red)
    expect(cornerFmt?.borders?.left).toEqual(red)
    expect(cornerFmt?.borders?.right).toBeUndefined()
    expect(cornerFmt?.borders?.bottom).toBeUndefined()

    // interior cell (1x1 range has none interior): use a larger range
    const bigger = asRawRange({ startRow: 0, endRow: 2, startCol: 0, endCol: 2 })
    const store2 = new RangeStyleStore()
    store2.applyBorders(bigger, 'outer', red)
    const interior = store2.resolveCell(1, 1)
    expect(interior).toBeUndefined()
  })

  it('clearBorders makes borders undefined after applyBorders', () => {
    const store = new RangeStyleStore()
    const smallRange = asRawRange({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 })

    store.applyBorders(smallRange, 'outer', red)
    expect(store.resolveCell(0, 0)?.borders).toBeDefined()

    store.clearBorders(smallRange)
    expect(store.resolveCell(0, 0)?.borders).toBeUndefined()
    expect(store.resolveCell(0, 0)).toBeUndefined()
  })
})
