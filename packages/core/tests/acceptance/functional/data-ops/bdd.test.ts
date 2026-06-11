import { describe, expect, it } from 'bun:test'

import {
  DEFAULT_EXCEL_WORKSPACE_POLICY,
  ExcelWorkspaceController,
  Grid,
  InMemoryDataSource,
  SparseExcelDataSource,
  decideExcelWorkspaceResize,
  formatValue,
  type CellValue,
  type DataSourceEvent,
  type Row,
  type Schema,
  type ValueFormat,
} from '../../../../src'
import { expectGolden } from '../../_helpers/golden'
import {
  createDenseData,
  createMutableData,
  createWorkspacePort,
  fillRange,
  lastFrame,
  mountRecordingGrid,
  mutableSchema,
  withManualRaf,
} from '../../_helpers/fixtures'

describe('Core acceptance data ops', () => {
it('core.L0.datasource-in-memory-read-cell reads cells and inclusive rows', () => {
    const data = createDenseData()

    expect(data.getCell(0, 'name')).toBe('Ada')
    expect(data.getCell(1, 'score')).toBe(20)
    expect(data.getRows(0, 1)).toHaveLength(2)
  })

  it('core.L0.format-value-number matches descriptor matrix golden', () => {
    const ctx = {
      field: { id: 'amount', name: 'Amount', type: 'number', width: 100 },
      locale: 'en-US',
    } as const
    // label 手写而非 Date.toISOString()——后者按 UTC 输出，跨时区跑会抖动黄金文件。
    const sampleDate = new Date(2024, 5, 9, 8, 5, 3)
    const cases: ReadonlyArray<readonly [string, CellValue, ValueFormat]> = [
      ['1234.5', 1234.5, { kind: 'number', decimals: 2 }],
      ['1234.5', 1234.5, { kind: 'number', decimals: 0 }],
      ['-1234.5', -1234.5, { kind: 'number', decimals: 2 }],
      ['"1234.5" (text)', '1234.5', { kind: 'number', decimals: 2 }],
      ['0.1357', 0.1357, { kind: 'percent', decimals: 1 }],
      ['1', 1, { kind: 'percent', decimals: 0 }],
      ['1234.5', 1234.5, { kind: 'currency', currency: 'USD' }],
      ['1234.5', 1234.5, { kind: 'currency', currency: 'CNY', locale: 'zh-CN' }],
      ['date(2024-06-09 08:05:03)', sampleDate, { kind: 'date', pattern: 'YYYY-MM-DD' }],
      ['date(2024-06-09 08:05:03)', sampleDate, { kind: 'date', pattern: 'YYYY-MM-DD HH:mm:ss' }],
    ]
    const dump = cases
      .map(
        ([label, value, format]) =>
          `${label} × ${JSON.stringify(format)} → ${formatValue(value, format, ctx, {})}`,
      )
      .join('\n')
    expectGolden(import.meta.dir, 'core.L0.format-value-number', `${dump}\n`)
  })

  it('core.L0.datasource-in-memory-get-rows-inclusive clamps inclusive row ranges', () => {
    const data = createMutableData()

    expect(data.getRows(0, 2).map((row) => row.a)).toEqual(['r0', 'r1', 'r2'])
    expect(data.getRows(-5, 20)).toHaveLength(3)
    expect(data.getRows(2, 1)).toEqual([])
  })

  it('core.L0.datasource-in-memory-insert-delete-rows observes row structure changes', () => {
    const data = new InMemoryDataSource({
      schema: mutableSchema,
      rows: [
        { a: 'r0', b: 10 },
        { a: 'r1', b: 20 },
      ] satisfies Row[],
    })
    const events: DataSourceEvent[] = []
    data.subscribe((event) => events.push(event))

    const newIds = data.insertRows(1, 2)

    expect(newIds).toEqual([1, 2])
    expect(data.getRowCount()).toBe(4)
    expect(data.getCell(1, 'a')).toBeUndefined()
    expect(data.getCell(1, 'b')).toBe(0)
    expect(data.getCell(3, 'a')).toBe('r1')

    const snapshots = data.deleteRows([0, 3])

    expect(snapshots).toEqual([
      { originalUnderlyingRow: 0, cells: { a: 'r0', b: 10 } },
      { originalUnderlyingRow: 3, cells: { a: 'r1', b: 20 } },
    ])
    expect(data.getRowCount()).toBe(2)
    expect(events).toContainEqual({ type: 'rowsInserted', at: 1, count: 2 })
    expect(events).toContainEqual({ type: 'rowCountChanged', newCount: 4 })
    expect(events).toContainEqual({ type: 'rowsDeleted', removed: [0, 3] })
    expect(events).toContainEqual({ type: 'rowCountChanged', newCount: 2 })
  })

  it('core.L0.datasource-in-memory-insert-delete-fields observes schema changes and snapshots', () => {
    const data = createDenseData()
    const city = { id: 'city', name: 'City', type: 'text' as const, width: 100 }

    const inserted = data.insertField(1, city)

    expect(inserted).toEqual(city)
    expect(data.getSchema().fields.map((field) => field.id)).toEqual(['name', 'city', 'score'])
    expect(data.getCell(0, 'city')).toBeUndefined()

    const removed = data.removeField('score')

    expect(removed).not.toBeNull()
    expect(removed!.originalIndex).toBe(2)
    expect(removed!.field.id).toBe('score')
    expect(removed!.cells).toEqual([10, 20])
    expect(data.getSchema().fields.map((field) => field.id)).toEqual(['name', 'city'])
    expect(data.getCell(0, 'score')).toBeUndefined()
  })

  it('core.L0.datasource-in-memory-move-fields preserves cell values by field id', () => {
    const data = createMutableData()

    data.moveFields(['b', 'c'], 'a')

    expect(data.getSchema().fields.map((field) => field.id)).toEqual(['b', 'c', 'a', 'd'])
    expect(data.getCell(0, 'b')).toBe(10)
    expect(data.getCell(0, 'c')).toBe('c0')

    data.moveFields(['a', 'b'], null)

    expect(data.getSchema().fields.map((field) => field.id)).toEqual(['c', 'd', 'b', 'a'])
    expect(data.getCell(0, 'a')).toBe('r0')
    expect(data.getCell(0, 'b')).toBe(10)
  })

  it('core.L0.datasource-sparse-default-workspace exposes sparse default bounds', () => {
    const data = new SparseExcelDataSource()

    expect(data.getRowCount()).toBe(1000)
    expect(data.getSchema().fields[0]!.id).toBe('A')
    expect(data.getSchema().fields.at(-1)!.id).toBe('Z')
    expect(data.getRows(0, 10)).toHaveLength(11)

    data.updateCell(2, 'B', 'hello')

    expect(data.getCell(2, 'B')).toBe('hello')
    expect(data.getContentBounds()).toEqual({ startRow: 2, endRow: 2, startCol: 1, endCol: 1 })
  })

  it('core.L0.workspace-autogrow-scroll-intent grows only from wheel edge intent', () => {
    const policy = {
      ...DEFAULT_EXCEL_WORKSPACE_POLICY,
      minRows: 10,
      minCols: 5,
      rowGrowBatch: 20,
      colGrowBatch: 3,
      rowGrowThreshold: 5,
      colGrowThreshold: 2,
      rowBuffer: 5,
      colBuffer: 2,
      maxRows: 200,
      maxCols: 20,
    }

    const decision = decideExcelWorkspaceResize({
      policy,
      nowMs: 100,
      size: { rowCount: 100, colCount: 10 },
      visible: { rows: [92, 99], cols: [0, 4] },
      contentBounds: { startRow: 0, endRow: 98, startCol: 0, endCol: 3 },
      intent: { kind: 'wheel', atMs: 90, deltaX: 0, deltaY: 120 },
      hasMaterializedRows: true,
      hasMaterializedCols: false,
      lastGrowAtMs: null,
    })

    expect(decision).toEqual({ kind: 'grow', rows: 20, cols: 0 })

    const port = createWorkspacePort()
    const controller = new ExcelWorkspaceController({ port, policy })
    controller.recordWheel({ atMs: 90, deltaX: 0, deltaY: 120 })
    controller.afterScrollFrame(100)

    expect(port.appendedRows).toBe(20)
    expect(port.size.rowCount).toBe(120)
  })

const viewSchema: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 120 },
    { id: 'score', name: 'Score', type: 'number', width: 80 },
  ],
}

function createViewSortData(): InMemoryDataSource {
  return new InMemoryDataSource({
    schema: viewSchema,
    rows: [
      { name: 'Beta', score: 2 },
      { name: 'alpha', score: 1 },
      { name: 'Gamma', score: 3 },
    ] satisfies Row[],
  })
}

function createViewFilterData(): InMemoryDataSource {
  return new InMemoryDataSource({
    schema: viewSchema,
    rows: [
      { name: 'Alpha', score: 5 },
      { name: 'beta', score: 10 },
      { name: 'ALPINE', score: 15 },
      { name: '', score: null },
    ] satisfies Row[],
  })
}

function createViewHideData(): InMemoryDataSource {
  return new InMemoryDataSource({
    schema: { fields: [{ id: 'n', name: 'N', type: 'number', width: 100 }] },
    rows: [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }] satisfies Row[],
  })
}

function viewColumnValues(grid: Grid, fieldId: string): unknown[] {
  const data = grid.getViewPipeline().getComposed()
  return Array.from({ length: data.getRowCount() }, (_, row) => data.getCell(row, fieldId))
}

  it('core.L2.grid-view-sort-ascending-descending reorders rows through SortLayer', () => {
    const { container, grid } = mountRecordingGrid({ data: createViewSortData() })

    expect(grid.getSortLayer().setSpec({ fieldId: 'score', direction: 'asc' })).toBe(true)
    expect(viewColumnValues(grid, 'score')).toEqual([1, 2, 3])

    expect(grid.getSortLayer().setSpec({ fieldId: 'score', direction: 'desc' })).toBe(true)
    expect(viewColumnValues(grid, 'score')).toEqual([3, 2, 1])

    grid.destroy()
    document.body.removeChild(container)
  })

  it('core.L2.grid-view-filter-contains-equals filters composed view rows', () => {
    const { container, grid } = mountRecordingGrid({ data: createViewFilterData() })

    expect(
      grid.getFilterLayer().setSpec({
        fieldId: 'name',
        op: { kind: 'text-contains', value: 'alp', caseSensitive: false },
      }),
    ).toBe(true)
    expect(viewColumnValues(grid, 'name')).toEqual(['Alpha', 'ALPINE'])

    expect(
      grid.getFilterLayer().setSpec({
        fieldId: 'name',
        op: { kind: 'text-equals', value: 'Alpha', caseSensitive: false },
      }),
    ).toBe(true)
    expect(viewColumnValues(grid, 'name')).toEqual(['Alpha'])

    grid.destroy()
    document.body.removeChild(container)
  })

  it('core.L2.grid-view-hide-sort-filter-compose applies hide sort and filter together', () =>
    withManualRaf((flushRaf) => {
      const { container, grid, recorder } = mountRecordingGrid({ data: createViewHideData() })

      grid.hideRows([0, 1])
      grid.getSortLayer().setSpec({ fieldId: 'n', direction: 'desc' })
      flushRaf()

      let frame = lastFrame(recorder)
      expect(frame.data.getRowCount()).toBe(2)
      expect(frame.data.getCell(0, 'n')).toBe(4)
      expect(frame.data.getCell(1, 'n')).toBe(3)

      grid.getFilterLayer().setSpec({
        fieldId: 'n',
        op: { kind: 'number-equals', value: 4 },
      })
      flushRaf()

      frame = lastFrame(recorder)
      expect(frame.data.getRowCount()).toBe(1)
      expect(frame.data.getCell(0, 'n')).toBe(4)

      grid.destroy()
      document.body.removeChild(container)
    }))

  it('core.L2.grid-view-format-uses-raw-keys keeps fill color on sorted view row', () => {
    const { container, grid } = mountRecordingGrid({ data: createViewSortData() })

    expect(grid.setFillColor(fillRange(0, 0, 0, 0), '#ffeedd')).toBe(true)
    expect(grid.getViewCellFormat(0, 0)?.fillColor).toBe('#ffeedd')

    grid.getSortLayer().setSpec({ fieldId: 'score', direction: 'asc' })
    expect(grid.getViewCellFormat(0, 0)?.fillColor).toBeUndefined()
    expect(grid.getViewCellFormat(1, 0)?.fillColor).toBe('#ffeedd')

    grid.destroy()
    document.body.removeChild(container)
  })

  it('core.L2.grid-view-merge-resolves-view-raw remaps merge region after sort', () => {
    const data = new InMemoryDataSource({
      schema: viewSchema,
      rows: [
        { name: 'pair-a', score: 10 },
        { name: 'pair-b', score: 10 },
        { name: 'solo', score: 30 },
      ] satisfies Row[],
    })
    const { container, grid } = mountRecordingGrid({ data })
    const mergeRange = fillRange(0, 1, 0, 0)

    expect(grid.mergeCells(mergeRange)).toBe(true)
    grid.getSortLayer().setSpec({ fieldId: 'score', direction: 'desc' })

    expect(grid.getViewMergeRegion(2, 0)?.range).toEqual({
      startRow: 1,
      endRow: 2,
      startCol: 0,
      endCol: 0,
    })

    grid.destroy()
    document.body.removeChild(container)
  })
})
