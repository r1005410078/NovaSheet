import { describe, expect, it, mock } from 'bun:test'
import {
  computePasteTarget,
  applyPaste,
  type ApplyPasteSource,
} from '../../src/clipboard/ApplyPaste'
import type { Schema } from '../../src/data/Schema'

const schema: Schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text', width: 100 },
    { id: 'b', name: 'B', type: 'number', width: 100 },
    { id: 'c', name: 'C', type: 'text', width: 100 },
  ],
}

describe('computePasteTarget', () => {
  it('单格选区 → 从 active cell 起向右下扩 sourceRows × sourceCols', () => {
    const t = computePasteTarget(
      { rowIndex: 2, colIndex: 1 },
      { startRow: 2, endRow: 2, startCol: 1, endCol: 1 },
      3,
      2,
      { rowCount: 10, colCount: 3 },
    )
    expect(t).toEqual({
      startRow: 2,
      endRow: 4,
      startCol: 1,
      endCol: 2,
      tile: { rows: 1, cols: 1 },
    })
  })

  it('一对一选区 → 用 selectedRange 本身', () => {
    const t = computePasteTarget(
      { rowIndex: 1, colIndex: 0 },
      { startRow: 1, endRow: 3, startCol: 0, endCol: 1 },
      3,
      2,
      { rowCount: 10, colCount: 3 },
    )
    expect(t).toEqual({
      startRow: 1,
      endRow: 3,
      startCol: 0,
      endCol: 1,
      tile: { rows: 1, cols: 1 },
    })
  })

  it('整数倍 tile：4×4 选区 × 2×2 源 → tile 2×2', () => {
    const t = computePasteTarget(
      { rowIndex: 0, colIndex: 0 },
      { startRow: 0, endRow: 3, startCol: 0, endCol: 3 },
      2,
      2,
      { rowCount: 10, colCount: 4 },
    )
    expect(t).toEqual({
      startRow: 0,
      endRow: 3,
      startCol: 0,
      endCol: 3,
      tile: { rows: 2, cols: 2 },
    })
  })

  it('mismatch：从 selection 左上角填，多余 source 丢，不足 target 不动', () => {
    const t = computePasteTarget(
      { rowIndex: 0, colIndex: 0 },
      { startRow: 0, endRow: 2, startCol: 0, endCol: 0 },
      2,
      2,
      { rowCount: 10, colCount: 3 },
    )
    expect(t).toEqual({
      startRow: 0,
      endRow: 1,
      startCol: 0,
      endCol: 1,
      tile: { rows: 1, cols: 1 },
    })
  })

  it('超出 grid 边界 → 裁切', () => {
    const t = computePasteTarget(
      { rowIndex: 8, colIndex: 2 },
      { startRow: 8, endRow: 8, startCol: 2, endCol: 2 },
      5,
      3,
      { rowCount: 10, colCount: 3 },
    )
    expect(t).toEqual({
      startRow: 8,
      endRow: 9,
      startCol: 2,
      endCol: 2,
      tile: { rows: 1, cols: 1 },
    })
  })
})

describe('applyPaste', () => {
  function makeData() {
    const writes: { row: number; field: string; value: unknown }[] = []
    return {
      writes,
      updateCell: mock((row: number, field: string, value: unknown) => {
        writes.push({ row, field, value })
      }),
    }
  }

  const fields = ['a', 'b', 'c']

  it('1×2 source → target 1×2 写两格', () => {
    const data = makeData()
    const source: ApplyPasteSource = {
      cells: [['hello', 42]],
      sourceFieldIds: ['a', 'b'],
      typed: true,
    }
    applyPaste(
      source,
      { startRow: 0, endRow: 0, startCol: 0, endCol: 1, tile: { rows: 1, cols: 1 } },
      schema,
      fields,
      data as never,
    )
    expect(data.writes).toEqual([
      { row: 0, field: 'a', value: 'hello' },
      { row: 0, field: 'b', value: 42 },
    ])
  })

  it('类型不匹配跳过 + onSkipped 收集', () => {
    const data = makeData()
    const skipped: { rowIndex: number; fieldId: string; reason: string }[] = []
    const source: ApplyPasteSource = {
      cells: [['abc']],
      sourceFieldIds: ['b'],
      typed: false,
    }
    applyPaste(
      source,
      { startRow: 0, endRow: 0, startCol: 1, endCol: 1, tile: { rows: 1, cols: 1 } },
      schema,
      fields,
      data as never,
      (s) => skipped.push(...s),
    )
    expect(data.writes).toHaveLength(0)
    expect(skipped).toEqual([{ rowIndex: 0, fieldId: 'b', reason: 'type' }])
  })

  it('tile：2×2 source tile 2 次 → 写 4×2 = 8 格', () => {
    const data = makeData()
    const source: ApplyPasteSource = {
      cells: [
        ['x', 1],
        ['y', 2],
      ],
      sourceFieldIds: ['a', 'b'],
      typed: true,
    }
    applyPaste(
      source,
      { startRow: 0, endRow: 3, startCol: 0, endCol: 1, tile: { rows: 2, cols: 1 } },
      schema,
      fields,
      data as never,
    )
    expect(data.writes).toHaveLength(8)
    expect(data.writes.map((w) => w.value)).toEqual(['x', 1, 'y', 2, 'x', 1, 'y', 2])
  })
})
