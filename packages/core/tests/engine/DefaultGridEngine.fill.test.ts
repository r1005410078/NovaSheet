import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource } from '../../src/data/InMemoryDataSource'
import { DefaultGridEngine } from '../../src/engine/DefaultGridEngine'
import { FilterLayer } from '../../src/view/FilterLayer'
import { SortLayer } from '../../src/view/SortLayer'
import type { DataSource, DataSourceListener } from '../../src/data/DataSource'
import type { CellValue, Row, Schema } from '../../src/data/Schema'

const schema: Schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text', width: 80 },
    { id: 'b', name: 'B', type: 'number', width: 80 },
  ],
}

function engine() {
  return new DefaultGridEngine({
    data: new InMemoryDataSource({
      schema,
      rows: [
        { a: 'Item 1', b: 1 },
        { a: 'Item 2', b: 3 },
        { a: null, b: null },
        { a: null, b: null },
      ],
    }),
  })
}

function filteredSortedEngine() {
  const source = new InMemoryDataSource({
    schema,
    rows: [
      { a: 'skip', b: 100 },
      { a: 'Item 1', b: 1 },
      { a: 'Item 2', b: 3 },
      { a: null, b: null },
    ],
  })
  const filter = new FilterLayer()
  filter.setSpec({
    fieldId: 'a',
    op: { kind: 'text-contains', value: 'Item', caseSensitive: false },
  })
  const sort = new SortLayer()
  sort.setSpec({ fieldId: 'b', direction: 'desc' })
  const filtered = filter.wrap(source)
  const composed = sort.wrap(filtered)
  return { source, composed, engine: new DefaultGridEngine({ data: composed }) }
}

class OrderedViewDataSource implements DataSource {
  constructor(
    private readonly source: InMemoryDataSource,
    private order: number[],
  ) {}

  setOrder(order: number[]): void {
    this.order = order
  }

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

  getCell(rowIndex: number, fieldId: string): CellValue | undefined {
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

  updateCell(rowIndex: number, fieldId: string, value: CellValue): void {
    const underlyingRow = this.order[rowIndex]
    if (underlyingRow == null) return
    this.source.updateCellByUnderlyingRow(underlyingRow, fieldId, value)
  }

  updateCellByUnderlyingRow(row: number, fieldId: string, value: CellValue): void {
    this.source.updateCellByUnderlyingRow(row, fieldId, value)
  }
}

function orderedViewEngine() {
  const source = new InMemoryDataSource({
    schema,
    rows: [
      { a: 'skip', b: 100 },
      { a: 'Item 1', b: 1 },
      { a: 'Item 2', b: 3 },
    ],
  })
  const view = new OrderedViewDataSource(source, [2, 1])
  return { view, engine: new DefaultGridEngine({ data: view }) }
}

describe('DefaultGridEngine.commitFill', () => {
  it('writes fill range and leaves source unchanged', () => {
    const e = engine()
    const result = e.commitFill(
      { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
      { startRow: 2, endRow: 3, startCol: 0, endCol: 1 },
      'down',
    )
    expect(result?.writes.length).toBe(4)
    expect(e.getData().getCell(0, 'a')).toBe('Item 1')
    expect(e.getData().getCell(2, 'a')).toBe('Item 3')
    expect(e.getData().getCell(3, 'b')).toBe(7)
    expect(e.getSelection().selectedRange).toEqual({ startRow: 0, endRow: 3, startCol: 0, endCol: 1 })
  })

  it('pushes one undo command and restores selection to written rows', () => {
    const e = engine()
    e.commitFill(
      { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
      { startRow: 2, endRow: 3, startCol: 0, endCol: 1 },
      'down',
    )
    const cmd = e.undo()
    expect(cmd?.kind).toBe('fill')
    expect(e.getData().getCell(2, 'a')).toBeNull()
    expect(e.getData().getCell(3, 'b')).toBeNull()
    expect(e.getData().getCell(0, 'a')).toBe('Item 1')
    expect(e.getSelection().selectedRange).toEqual({ startRow: 2, endRow: 3, startCol: 0, endCol: 1 })
  })

  it('redo writes fill values again and restores selection to written rows', () => {
    const e = engine()
    e.commitFill(
      { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
      { startRow: 2, endRow: 3, startCol: 0, endCol: 1 },
      'down',
    )
    e.undo()
    const cmd = e.redo()
    expect(cmd?.kind).toBe('fill')
    expect(e.getData().getCell(2, 'a')).toBe('Item 3')
    expect(e.getSelection().selectedRange).toEqual({ startRow: 2, endRow: 3, startCol: 0, endCol: 1 })
  })

  it('non-mutable data source does not write or push undo', () => {
    const readonly: DataSource = {
      getRowCount: () => 2,
      getSchema: () => schema,
      getRows: () => [],
      getCell: () => null,
      subscribe: () => () => {},
    }
    const e = new DefaultGridEngine({ data: readonly })
    expect(e.commitFill({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }, { startRow: 1, endRow: 1, startCol: 0, endCol: 0 }, 'down')).toBeNull()
    expect(e.canUndo()).toBe(false)
  })

  it('returns view-coordinate fill writes while storing undo writes by underlying row', () => {
    const { composed, engine: e } = filteredSortedEngine()
    expect(composed.resolveUnderlyingRow?.(0)).toBe(2)
    expect(composed.resolveUnderlyingRow?.(1)).toBe(1)

    const result = e.commitFill(
      { startRow: 1, endRow: 1, startCol: 0, endCol: 1 },
      { startRow: 0, endRow: 0, startCol: 0, endCol: 1 },
      'up',
    )
    expect(result?.writes).toEqual([
      { rowIndex: 0, fieldId: 'a', value: 'Item 1' },
      { rowIndex: 0, fieldId: 'b', value: 1 },
    ])

    const cmd = e.undo()
    expect(cmd?.kind).toBe('fill')
    if (cmd?.kind !== 'fill') return
    expect(cmd.before).toEqual([
      { rowIndex: 2, fieldId: 'a', value: 'Item 2' },
      { rowIndex: 2, fieldId: 'b', value: 3 },
    ])
    expect(cmd.after).toEqual([
      { rowIndex: 2, fieldId: 'a', value: 'Item 1' },
      { rowIndex: 2, fieldId: 'b', value: 1 },
    ])
  })

  it('undo fill maps range selection to visible written rows after view order changes', () => {
    const { view, engine: e } = orderedViewEngine()
    e.commitFill(
      { startRow: 1, endRow: 1, startCol: 0, endCol: 1 },
      { startRow: 0, endRow: 0, startCol: 0, endCol: 1 },
      'up',
    )

    view.setOrder([2])
    e.undo()

    expect(e.getSelection().activeCell).toEqual({ rowIndex: 0, colIndex: 0 })
    expect(e.getSelection().selectedRange).toEqual({
      startRow: 0,
      endRow: 0,
      startCol: 0,
      endCol: 1,
    })
  })
})
