import { describe, expect, it } from 'bun:test'
import {
  DefaultGridEngine,
  InMemoryDataSource,
  SKIP_CELL_VALUE,
  denseGridTheme,
  type DataSource,
  type DataSourceListener,
  type Row,
  type Schema,
} from '../../src'

const SCHEMA: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 200 },
    { id: 'age', name: 'Age', type: 'number', width: 80 },
  ],
}

function makeData(rows = 10) {
  return new InMemoryDataSource({
    schema: SCHEMA,
    rows: Array.from({ length: rows }, (_, i) => ({ name: `n${i}`, age: i })),
  })
}

class OrderedViewDataSource implements DataSource {
  constructor(
    private readonly source: InMemoryDataSource,
    private readonly order: readonly number[],
  ) {}

  getRowCount(): number {
    return this.order.length
  }

  getSchema(): Schema {
    return this.source.getSchema()
  }

  getRows(startIndex: number, endIndex: number): Row[] {
    const rows: Row[] = []
    for (let viewRow = startIndex; viewRow <= endIndex; viewRow += 1) {
      const underlyingRow = this.order[viewRow]
      if (underlyingRow == null) continue
      const [row] = this.source.getRows(underlyingRow, underlyingRow)
      if (row) rows.push(row)
    }
    return rows
  }

  getCell(rowIndex: number, fieldId: string) {
    const underlyingRow = this.order[rowIndex]
    return underlyingRow == null ? undefined : this.source.getCell(underlyingRow, fieldId)
  }

  resolveUnderlyingRow(viewRow: number): number {
    return this.order[viewRow] ?? -1
  }

  findViewRow(underlyingRow: number): number {
    return this.order.indexOf(underlyingRow)
  }

  subscribe(_listener: DataSourceListener): () => void {
    return () => {}
  }
}

describe('DefaultGridEngine — 默认引擎', () => {
  it('用默认主题与 schema 列宽初始化', () => {
    const engine = new DefaultGridEngine({ data: makeData(5) })
    expect(engine.getRowsAxis().getCount()).toBe(5)
    expect(engine.getColsAxis().getCount()).toBe(2)
    expect(engine.getTheme()).toBe(denseGridTheme)
  })

  it('setData 重建行列轴', () => {
    const engine = new DefaultGridEngine({ data: makeData(5) })
    engine.setData(makeData(100))
    expect(engine.getRowsAxis().getCount()).toBe(100)
  })

  it('setViewData 重建行列轴', () => {
    const engine = new DefaultGridEngine({ data: makeData(5) })
    engine.setViewData(makeData(100))
    expect(engine.getRowsAxis().getCount()).toBe(100)
  })

  it('setRowHeight 更新行轴', () => {
    const engine = new DefaultGridEngine({ data: makeData(10) })
    const before = engine.getRowsAxis().getSize(3)
    engine.setRowHeight(3, before * 2)
    expect(engine.getRowsAxis().getSize(3)).toBe(before * 2)
  })

  it('setColumnWidth 按 fieldId 更新列轴', () => {
    const engine = new DefaultGridEngine({ data: makeData(10) })
    engine.setColumnWidth('age', 250)
    expect(engine.getColsAxis().getSize(1)).toBe(250)
  })

  it('未知 fieldId 的 setColumnWidth 为 no-op', () => {
    const engine = new DefaultGridEngine({ data: makeData(10) })
    expect(() => engine.setColumnWidth('nope', 250)).not.toThrow()
  })

  it('getFrame 返回引擎快照', () => {
    const engine = new DefaultGridEngine({ data: makeData(10) })
    engine.setViewportSize(400, 300)
    const frame = engine.getFrame()
    expect(frame.data.getRowCount()).toBe(10)
    expect(frame.theme).toBe(denseGridTheme)
    expect(frame.rowsAxis.getCount()).toBe(10)
    expect(frame.viewport.contentRect.width).toBe(400)
  })

  it('把 selection 放进 RenderFrame，供 renderer overlay 绘制', () => {
    const engine = new DefaultGridEngine({ data: makeData(5) })

    engine.selectCell({ rowIndex: 2, colIndex: 1 })

    expect(engine.getSelection()).toEqual({
      activeCell: { rowIndex: 2, colIndex: 1 },
      anchorCell: { rowIndex: 2, colIndex: 1 },
      extentCell: { rowIndex: 2, colIndex: 1 },
      selectedRange: {
        startRow: 2,
        endRow: 2,
        startCol: 1,
        endCol: 1,
      },
    })
    expect(engine.getFrame().selection).toEqual(engine.getSelection())
  })

  it('setViewData after sort remaps active selection to the same underlying row', () => {
    const source = makeData(3)
    const oldView = new OrderedViewDataSource(source, [0, 1, 2])
    const newView = new OrderedViewDataSource(source, [2, 1, 0])
    const engine = new DefaultGridEngine({ data: oldView })

    engine.selectCell({ rowIndex: 0, colIndex: 1 })
    engine.setViewData(newView, {
      oldResolveUnderlyingRow: (viewRow) => oldView.resolveUnderlyingRow(viewRow),
    })

    expect(engine.getSelection().activeCell).toEqual({ rowIndex: 2, colIndex: 1 })
    expect(engine.getSelection().selectedRange).toEqual({
      startRow: 2,
      endRow: 2,
      startCol: 1,
      endCol: 1,
    })
  })

  it('setViewData preserves a range when remapped rows stay contiguous', () => {
    const source = makeData(4)
    const oldView = new OrderedViewDataSource(source, [0, 1, 2, 3])
    const newView = new OrderedViewDataSource(source, [3, 2, 1, 0])
    const engine = new DefaultGridEngine({ data: oldView })

    engine.selectCell({ rowIndex: 0, colIndex: 0 })
    engine.selectCell({ rowIndex: 1, colIndex: 1 }, { extend: true })
    engine.setViewData(newView, {
      oldResolveUnderlyingRow: (viewRow) => oldView.resolveUnderlyingRow(viewRow),
    })

    expect(engine.getSelection().activeCell).toEqual({ rowIndex: 3, colIndex: 0 })
    expect(engine.getSelection().anchorCell).toEqual({ rowIndex: 2, colIndex: 0 })
    expect(engine.getSelection().extentCell).toEqual({ rowIndex: 3, colIndex: 1 })
    expect(engine.getSelection().selectedRange).toEqual({
      startRow: 2,
      endRow: 3,
      startCol: 0,
      endCol: 1,
    })
  })

  it('setViewData degrades a non-contiguous remapped range to the active cell', () => {
    const source = makeData(3)
    const oldView = new OrderedViewDataSource(source, [0, 1, 2])
    const newView = new OrderedViewDataSource(source, [0, 2, 1])
    const engine = new DefaultGridEngine({ data: oldView })

    engine.selectCell({ rowIndex: 0, colIndex: 0 })
    engine.selectCell({ rowIndex: 1, colIndex: 1 }, { extend: true })
    engine.setViewData(newView, {
      oldResolveUnderlyingRow: (viewRow) => oldView.resolveUnderlyingRow(viewRow),
    })

    expect(engine.getSelection().activeCell).toEqual({ rowIndex: 0, colIndex: 0 })
    expect(engine.getSelection().selectedRange).toEqual({
      startRow: 0,
      endRow: 0,
      startCol: 0,
      endCol: 0,
    })
  })

  it('setViewData clears selection when the selected underlying row is filtered out', () => {
    const source = makeData(3)
    const oldView = new OrderedViewDataSource(source, [0, 1, 2])
    const newView = new OrderedViewDataSource(source, [0, 1])
    const engine = new DefaultGridEngine({ data: oldView })

    engine.selectCell({ rowIndex: 2, colIndex: 1 })
    engine.setViewData(newView, {
      oldResolveUnderlyingRow: (viewRow) => oldView.resolveUnderlyingRow(viewRow),
    })

    expect(engine.getSelection()).toEqual({
      activeCell: null,
      anchorCell: null,
      extentCell: null,
      selectedRange: null,
    })
  })

  it('Phase 3.5 — begin / commit 单元格编辑', () => {
    const data = makeData(3)
    const engine = new DefaultGridEngine({ data })

    expect(engine.beginCellEdit({ rowIndex: 1, colIndex: 0 })).toBe(true)
    expect(engine.isCellEditing()).toBe(true)
    engine.updateCellEditDraft('Bob')
    expect(engine.commitCellEdit()).toBe(true)
    expect(engine.isCellEditing()).toBe(false)
    expect(data.getCell(1, 'name')).toBe('Bob')
  })

  it('Phase 3.5 — 非法 number 提交失败且保持编辑态', () => {
    const engine = new DefaultGridEngine({ data: makeData(3) })
    engine.beginCellEdit({ rowIndex: 0, colIndex: 1 })
    engine.updateCellEditDraft('not-a-number')
    expect(engine.commitCellEdit()).toBe(false)
    expect(engine.isCellEditing()).toBe(true)
    engine.cancelCellEdit()
    expect(engine.isCellEditing()).toBe(false)
  })

  it('Phase 3.5 — checkbox 列不可编辑', () => {
    const schema: Schema = {
      fields: [{ id: 'done', name: 'Done', type: 'checkbox', width: 80 }],
    }
    const engine = new DefaultGridEngine({
      data: new InMemoryDataSource({ schema, rows: [{ done: true }] }),
    })
    expect(engine.beginCellEdit({ rowIndex: 0, colIndex: 0 })).toBe(false)
  })

  it('core.L0.cell-extension-custom-type-fallback refuses editing for unregistered custom type', () => {
    const schema: Schema = {
      fields: [{ id: 'score', name: 'Score', type: 'rating', width: 120 }],
    }
    const data = new InMemoryDataSource({ schema, rows: [{ score: 4 }] })
    const engine = new DefaultGridEngine({ data })

    expect(engine.beginCellEdit({ rowIndex: 0, colIndex: 0 })).toBe(false)
    expect(data.getCell(0, 'score')).toBe(4)
  })

  it('core.L0.cell-extension-type-definition-contract uses custom parseEditInput', () => {
    const schema: Schema = {
      fields: [{ id: 'score', name: 'Score', type: 'rating', width: 120, options: { max: 5 } }],
    }
    const data = new InMemoryDataSource({ schema, rows: [{ score: 4 }] })
    const engine = new DefaultGridEngine({
      data,
      cellTypes: {
        rating: {
          editable: true,
          formatForEdit: (value) => String(value ?? ''),
          parseEditInput: (input, ctx) => {
            const n = Number(input)
            if (Number.isNaN(n)) return SKIP_CELL_VALUE
            return Math.min(Number(ctx.field.options?.max ?? 5), n)
          },
        },
      },
    })

    expect(engine.beginCellEdit({ rowIndex: 0, colIndex: 0 })).toBe(true)
    engine.updateCellEditDraft('bad')
    expect(engine.commitCellEdit()).toBe(false)
    expect(engine.isCellEditing()).toBe(true)
    expect(data.getCell(0, 'score')).toBe(4)
    engine.updateCellEditDraft('8')
    expect(engine.commitCellEdit()).toBe(true)
    expect(data.getCell(0, 'score')).toBe(5)
  })

  it('hideCols commits a valid custom edit before removing the edited field from view schema', () => {
    const schema: Schema = {
      fields: [{ id: 'score', name: 'Score', type: 'rating', width: 120, options: { max: 5 } }],
    }
    const data = new InMemoryDataSource({ schema, rows: [{ score: 4 }] })
    const engine = new DefaultGridEngine({
      data,
      cellTypes: {
        rating: {
          editable: true,
          formatForEdit: (value) => String(value ?? ''),
          parseEditInput: (input) => {
            const n = Number(input)
            return Number.isNaN(n) ? SKIP_CELL_VALUE : n
          },
        },
      },
    })

    expect(engine.beginCellEdit({ rowIndex: 0, colIndex: 0 })).toBe(true)
    engine.updateCellEditDraft('5')
    engine.hideCols(['score'])

    expect(data.getCell(0, 'score')).toBe(5)
    expect(engine.isCellEditing()).toBe(false)
  })

  it('hideCols cancels an invalid custom edit before removing the edited field from view schema', () => {
    const schema: Schema = {
      fields: [{ id: 'score', name: 'Score', type: 'rating', width: 120 }],
    }
    const data = new InMemoryDataSource({ schema, rows: [{ score: 4 }] })
    const engine = new DefaultGridEngine({
      data,
      cellTypes: {
        rating: {
          editable: true,
          formatForEdit: (value) => String(value ?? ''),
          parseEditInput: (input) => {
            const n = Number(input)
            return Number.isNaN(n) ? SKIP_CELL_VALUE : n
          },
        },
      },
    })

    expect(engine.beginCellEdit({ rowIndex: 0, colIndex: 0 })).toBe(true)
    engine.updateCellEditDraft('bad')
    engine.hideCols(['score'])

    expect(data.getCell(0, 'score')).toBe(4)
    expect(engine.isCellEditing()).toBe(false)
  })

  it('Phase 4.1 — clearRange 把 MutableDataSource 内每个 cell 置 null', () => {
    const schema: Schema = {
      fields: [
        { id: 'a', name: 'A', type: 'text', width: 100 },
        { id: 'b', name: 'B', type: 'number', width: 100 },
      ],
    }
    const data = new InMemoryDataSource({
      schema,
      rows: [
        { a: 'x', b: 1 },
        { a: 'y', b: 2 },
      ],
    })
    const engine = new DefaultGridEngine({ data })
    engine.clearRange({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 })
    expect(data.getCell(0, 'a')).toBe(null)
    expect(data.getCell(0, 'b')).toBe(null)
    expect(data.getCell(1, 'a')).toBe(null)
    expect(data.getCell(1, 'b')).toBe(null)
  })

  it('Phase 4.1 — clearRange 在 non-Mutable DataSource 上 silent no-op', () => {
    const data = {
      getRowCount: () => 1,
      getSchema: () => ({ fields: [{ id: 'a', name: 'A', type: 'text' as const, width: 100 }] }),
      getRows: () => [],
      getCell: () => 'x',
      subscribe: () => () => {},
    }
    const engine = new DefaultGridEngine({ data: data as never })
    expect(() =>
      engine.clearRange({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }),
    ).not.toThrow()
  })
})
