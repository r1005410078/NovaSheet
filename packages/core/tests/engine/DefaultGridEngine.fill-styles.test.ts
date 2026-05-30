import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource } from '../../src/data/InMemoryDataSource'
import { DefaultGridEngine } from '../../src/engine/DefaultGridEngine'
import { FilterLayer } from '../../src/view/FilterLayer'
import { SortLayer } from '../../src/view/SortLayer'
import type { BorderStyle, CellRange } from '../../src/index'
import type { Row, Schema } from '../../src/data/Schema'

const schema: Schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text', width: 80 },
    { id: 'b', name: 'B', type: 'text', width: 80 },
  ],
}

const RED: BorderStyle = { color: '#cc0000', width: 'thin', lineStyle: 'solid' }

function engine(rowCount = 6) {
  const rows: Row[] = Array.from({ length: rowCount }, (_, i) => ({ a: `r${i}`, b: `s${i}` }))
  return new DefaultGridEngine({ data: new InMemoryDataSource({ schema, rows }) })
}

function cell(rowIndex: number, colIndex: number): CellRange {
  return { startRow: rowIndex, endRow: rowIndex, startCol: colIndex, endCol: colIndex }
}

describe('DefaultGridEngine.commitFill — 颜色/边框传播', () => {
  it('向下填充把源填充色复制到目标格', () => {
    const e = engine()
    e.setFillColor(cell(0, 0), '#ff0000')
    e.commitFill(cell(0, 0), { startRow: 1, endRow: 2, startCol: 0, endCol: 0 }, 'down')
    expect(e.getCellFormat(1, 0)?.fillColor).toBe('#ff0000')
    expect(e.getCellFormat(2, 0)?.fillColor).toBe('#ff0000')
  })

  it('多行源按块平铺（红/蓝交替）', () => {
    const e = engine()
    e.setFillColor(cell(0, 0), '#ff0000')
    e.setFillColor(cell(1, 0), '#0000ff')
    e.commitFill(
      { startRow: 0, endRow: 1, startCol: 0, endCol: 0 },
      { startRow: 2, endRow: 5, startCol: 0, endCol: 0 },
      'down',
    )
    expect(e.getCellFormat(2, 0)?.fillColor).toBe('#ff0000')
    expect(e.getCellFormat(3, 0)?.fillColor).toBe('#0000ff')
    expect(e.getCellFormat(4, 0)?.fillColor).toBe('#ff0000')
    expect(e.getCellFormat(5, 0)?.fillColor).toBe('#0000ff')
  })

  it('向右填充把源填充色沿列复制', () => {
    const e = engine()
    e.setFillColor(cell(0, 0), '#00ff00')
    e.commitFill(cell(0, 0), { startRow: 0, endRow: 0, startCol: 1, endCol: 1 }, 'right')
    expect(e.getCellFormat(0, 1)?.fillColor).toBe('#00ff00')
  })

  it('边框随填充复制', () => {
    const e = engine()
    e.setBorders(cell(0, 0), 'all', RED)
    e.commitFill(cell(0, 0), cell(1, 0), 'down')
    expect(e.getCellFormat(1, 0)?.borders).toBeDefined()
  })

  it('源无格式时清除目标格已有的陈旧格式', () => {
    const e = engine()
    e.setFillColor(cell(2, 0), '#123456') // 目标格预先有色
    e.commitFill(cell(0, 0), { startRow: 1, endRow: 2, startCol: 0, endCol: 0 }, 'down')
    expect(e.getCellFormat(2, 0)).toBeUndefined()
  })
})

describe('DefaultGridEngine.commitFill — 合并区传播', () => {
  it('单行合并源向下平铺到每个目标行', () => {
    const e = engine()
    e.mergeCells({ startRow: 0, endRow: 0, startCol: 0, endCol: 1 })
    e.commitFill(
      { startRow: 0, endRow: 0, startCol: 0, endCol: 1 },
      { startRow: 1, endRow: 3, startCol: 0, endCol: 1 },
      'down',
    )
    for (const r of [1, 2, 3]) {
      const region = e.getMergeRegion(r, 0)
      expect(region?.range).toEqual({ startRow: r, endRow: r, startCol: 0, endCol: 1 })
    }
  })

  it('盖到已有合并区时清除旧合并并按源块平铺（2 格源 → 3 格目标 = 2+1）', () => {
    const e = engine()
    e.mergeCells({ startRow: 0, endRow: 1, startCol: 0, endCol: 0 }) // A: 2 格
    e.mergeCells({ startRow: 2, endRow: 4, startCol: 0, endCol: 0 }) // B: 3 格
    e.commitFill(
      { startRow: 0, endRow: 1, startCol: 0, endCol: 0 },
      { startRow: 2, endRow: 4, startCol: 0, endCol: 0 },
      'down',
    )
    expect(e.getMergeRegion(2, 0)?.range).toEqual({
      startRow: 2,
      endRow: 3,
      startCol: 0,
      endCol: 0,
    })
    expect(e.getMergeRegion(4, 0)).toBeNull() // 剩 1 格为单格
  })

  it('单格源拖到已有合并区时取消其合并（与 Google 表格一致）', () => {
    const e = engine()
    e.mergeCells({ startRow: 2, endRow: 4, startCol: 0, endCol: 0 }) // B: 3 格合并
    e.commitFill(
      { startRow: 0, endRow: 0, startCol: 0, endCol: 0 }, // A: 单格
      { startRow: 1, endRow: 4, startCol: 0, endCol: 0 },
      'down',
    )
    expect(e.getMergeRegion(2, 0)).toBeNull()
    expect(e.getMergeRegion(3, 0)).toBeNull()
    expect(e.getMergeRegion(4, 0)).toBeNull()
  })

  it('单格源取消合并后可 undo 恢复', () => {
    const e = engine()
    e.mergeCells({ startRow: 2, endRow: 4, startCol: 0, endCol: 0 })
    e.commitFill(
      { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
      { startRow: 1, endRow: 4, startCol: 0, endCol: 0 },
      'down',
    )
    e.undo()
    expect(e.getMergeRegion(2, 0)?.range).toEqual({
      startRow: 2,
      endRow: 4,
      startCol: 0,
      endCol: 0,
    })
  })

  it('undo 恢复被覆盖的目标合并', () => {
    const e = engine()
    e.mergeCells({ startRow: 0, endRow: 1, startCol: 0, endCol: 0 })
    e.mergeCells({ startRow: 2, endRow: 4, startCol: 0, endCol: 0 })
    e.commitFill(
      { startRow: 0, endRow: 1, startCol: 0, endCol: 0 },
      { startRow: 2, endRow: 4, startCol: 0, endCol: 0 },
      'down',
    )
    e.undo()
    expect(e.getMergeRegion(2, 0)?.range).toEqual({
      startRow: 2,
      endRow: 4,
      startCol: 0,
      endCol: 0,
    })
  })

  it('整块放不下的尾部 tile 跳过', () => {
    const e = engine()
    e.mergeCells({ startRow: 0, endRow: 1, startCol: 0, endCol: 0 }) // 2 行高合并
    e.commitFill(
      { startRow: 0, endRow: 1, startCol: 0, endCol: 0 },
      { startRow: 2, endRow: 4, startCol: 0, endCol: 0 },
      'down',
    )
    expect(e.getMergeRegion(2, 0)?.range).toEqual({
      startRow: 2,
      endRow: 3,
      startCol: 0,
      endCol: 0,
    })
    expect(e.getMergeRegion(4, 0)).toBeNull() // rows 4-5 越界，跳过
  })
})

describe('DefaultGridEngine.commitFill — undo/redo', () => {
  it('undo 撤销填充色，redo 恢复', () => {
    const e = engine()
    e.setFillColor(cell(0, 0), '#ff0000')
    e.commitFill(cell(0, 0), cell(1, 0), 'down')
    expect(e.getCellFormat(1, 0)?.fillColor).toBe('#ff0000')
    e.undo()
    expect(e.getCellFormat(1, 0)).toBeUndefined()
    e.redo()
    expect(e.getCellFormat(1, 0)?.fillColor).toBe('#ff0000')
  })

  it('undo 撤销合并平铺，redo 恢复', () => {
    const e = engine()
    e.mergeCells({ startRow: 0, endRow: 0, startCol: 0, endCol: 1 })
    e.commitFill(
      { startRow: 0, endRow: 0, startCol: 0, endCol: 1 },
      { startRow: 1, endRow: 1, startCol: 0, endCol: 1 },
      'down',
    )
    expect(e.getMergeRegion(1, 0)).not.toBeNull()
    e.undo()
    expect(e.getMergeRegion(1, 0)).toBeNull()
    e.redo()
    expect(e.getMergeRegion(1, 0)).not.toBeNull()
  })
})

describe('DefaultGridEngine.getFillMergeSnap', () => {
  it('源含合并时返回合并块行/列跨度', () => {
    const e = engine()
    e.mergeCells({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 })
    expect(e.getFillMergeSnap({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 })).toEqual({
      rowSpan: 2,
      colSpan: 2,
    })
  })

  it('源无合并时返回 {1,1}（不吸附）', () => {
    const e = engine()
    expect(e.getFillMergeSnap(cell(0, 0))).toEqual({ rowSpan: 1, colSpan: 1 })
  })
})

describe('DefaultGridEngine.commitFill — 非连续 raw 保守跳过', () => {
  it('排序视图下仍填充值但不写入合并/格式', () => {
    const source = new InMemoryDataSource({
      schema,
      rows: [
        { a: 'Item 1', b: '1' },
        { a: 'Item 2', b: '2' },
        { a: 'Item 3', b: '3' },
      ],
    })
    const filter = new FilterLayer()
    filter.setSpec({
      fieldId: 'a',
      op: { kind: 'text-contains', value: 'Item', caseSensitive: false },
    })
    const sort = new SortLayer()
    sort.setSpec({ fieldId: 'a', direction: 'desc' })
    const composed = sort.wrap(filter.wrap(source))
    const e = new DefaultGridEngine({ data: composed })

    const result = e.commitFill(cell(0, 0), cell(1, 0), 'down')
    expect(result).not.toBeNull() // 值照填
    // 散裂映射下不应产生任何合并区
    expect(e.getMergeRegion(0, 0)).toBeNull()
    expect(e.getMergeRegion(1, 0)).toBeNull()
  })
})
