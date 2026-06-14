import { describe, expect, it, mock } from 'bun:test'

import {
  DefaultGridEngine,
  Grid,
  InMemoryDataSource,
  borderPatchForCell,
  dateToSerial,
  denseGridTheme,
  type BorderStyle,
  type CellEditorOpenContext,
  type CellTypeDefinition,
  type Row,
  type Schema,
  type Theme,
  type RenderBackendFactory,
} from '../../../../src'
import {
  createDenseData,
  createMutableData,
  createNoopBackend,
  fillRange,
  getScrollHost,
  lastFrame,
  mountRecordingGrid,
  schema,
  schemaFieldIds,
  singleCellSelection,
  withManualRaf,
  createScrollData,
  createWrapData,
} from '../../_helpers/fixtures'

describe('Core acceptance grid facade', () => {
  it('core.L2.grid-lifecycle-refresh-destroy keeps refresh and destroy safe', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const grid = new Grid(container, {
      data: createDenseData(),
      backend: createNoopBackend,
    })

    expect(() => grid.refresh()).not.toThrow()
    expect(() => grid.destroy()).not.toThrow()
    expect(() => grid.destroy()).not.toThrow()
  })

describe('Core BDD Batch 2 grid facade scenarios', () => {
  it('core.L2.grid-lifecycle-destroy-idempotent removes grid DOM safely', () => {
    const { container, grid, recorder } = mountRecordingGrid()

    expect(container.querySelector('[data-novasheet-scroll-host]')).not.toBeNull()
    expect(() => grid.destroy()).not.toThrow()
    expect(() => grid.destroy()).not.toThrow()

    expect(container.querySelector('[data-novasheet-scroll-host]')).toBeNull()
    expect(recorder.destroyCalls).toBeGreaterThan(0)
  })

  it('core.L2.grid-data-theme-refresh renders setData, setTheme, and refresh changes', () =>
    withManualRaf((flushRaf) => {
      const { container, grid, recorder } = mountRecordingGrid()
      const nextData = new InMemoryDataSource({
        schema,
        rows: [{ name: 'Lin', score: 30 }] satisfies Row[],
      })
      const nextTheme: Theme = {
        ...denseGridTheme,
        colors: { ...denseGridTheme.colors, background: '#fafafa' },
      }

      grid.setData(nextData)
      flushRaf()
      expect(lastFrame(recorder).data.getRowCount()).toBe(1)

      grid.setTheme(nextTheme)
      flushRaf()
      expect(lastFrame(recorder).theme.colors.background).toBe('#fafafa')

      const beforeRefresh = recorder.frames.length
      grid.refresh()
      flushRaf()
      expect(recorder.frames.length).toBeGreaterThan(beforeRefresh)

      grid.destroy()
      document.body.removeChild(container)
    }))

  it('core.L2.grid-layout-row-column-size updates frame axes through public facade', () =>
    withManualRaf((flushRaf) => {
      const { container, grid, recorder } = mountRecordingGrid({ data: createMutableData() })

      grid.setRowHeight(1, 44)
      grid.setRowHeights([0, 2], 36)
      grid.setColumnWidth('b', 140)
      grid.setColumnWidths(['c', 'd'], 160)
      flushRaf()

      const frame = lastFrame(recorder)
      expect(frame.rowsAxis.getSize(0)).toBe(36)
      expect(frame.rowsAxis.getSize(1)).toBe(44)
      expect(frame.rowsAxis.getSize(2)).toBe(36)
      expect(frame.colsAxis.getSize(1)).toBe(140)
      expect(frame.colsAxis.getSize(2)).toBe(160)
      expect(frame.colsAxis.getSize(3)).toBe(160)

      grid.destroy()
      document.body.removeChild(container)
    }))

  it('core.L2.grid-frozen-config-frame exposes frozen regions in render frame', () =>
    withManualRaf((flushRaf) => {
      const { container, grid, recorder } = mountRecordingGrid({ data: createMutableData() })

      grid.setFrozen({ topRows: 1, leftCols: 1, rightCols: 1 })
      flushRaf()

      const regionIds = lastFrame(recorder).viewport.regions.map((region) => region.id)
      expect(regionIds).toContain('main')
      expect(regionIds.length).toBeGreaterThan(1)

      grid.destroy()
      document.body.removeChild(container)
    }))

  it('core.L2.grid-scroll-row-cell updates native scroll host through public facade', () => {
    const { container, grid } = mountRecordingGrid({ data: createScrollData() })
    const scrollHost = getScrollHost(container)

    grid.scrollToRow(10, 'start')
    expect(scrollHost.scrollTop).toBeGreaterThan(0)

    grid.setColumnWidth('name', 500)
    grid.scrollToCell(5, 'score')
    expect(scrollHost.scrollTop).toBeGreaterThan(0)
    expect(scrollHost.scrollLeft).toBeGreaterThan(0)

    expect(() => grid.scrollToRow(-1, 'start')).not.toThrow()

    grid.destroy()
    document.body.removeChild(container)
  })

  it('core.L2.grid-autofit-wrap-rows computes and renders wrapped row height', () =>
    withManualRaf((flushRaf) => {
      const { container, grid, recorder } = mountRecordingGrid({ data: createWrapData() })

      const result = grid.autofitRows({ rows: [0], maxHeight: 120 })
      flushRaf()

      expect(result.changedRows).toBe(1)
      expect(lastFrame(recorder).rowsAxis.getSize(0)).toBeGreaterThan(denseGridTheme.metrics.rowHeight)

      grid.destroy()
      document.body.removeChild(container)
    }))
})

  it('core.L2.grid-rows-insert-delete-undo-redo tracks row count and history', () => {
    const data = createMutableData()
    const { container, grid } = mountRecordingGrid({ data })

    expect(data.getRowCount()).toBe(3)
    expect(grid.canUndo()).toBe(false)

    grid.insertRows(1, 1)
    expect(data.getRowCount()).toBe(4)
    expect(grid.canUndo()).toBe(true)
    expect(grid.canRedo()).toBe(false)

    grid.undo()
    expect(data.getRowCount()).toBe(3)
    expect(grid.canRedo()).toBe(true)

    grid.redo()
    expect(data.getRowCount()).toBe(4)

    grid.deleteRows([0])
    expect(data.getRowCount()).toBe(3)
    grid.undo()
    expect(data.getRowCount()).toBe(4)
    grid.redo()
    expect(data.getRowCount()).toBe(3)

    grid.destroy()
    document.body.removeChild(container)
  })

  it('core.L2.grid-rows-hide-unhide-visible-count updates hidden rows and rendered row count', () =>
    withManualRaf((flushRaf) => {
      const { container, grid, recorder } = mountRecordingGrid({ data: createMutableData() })

      grid.hideRows([1])
      flushRaf()

      expect(grid.getHiddenRows()).toEqual([1])
      expect(lastFrame(recorder).data.getRowCount()).toBe(2)

      grid.unhideRows([1])
      flushRaf()

      expect(grid.getHiddenRows()).toEqual([])
      expect(lastFrame(recorder).data.getRowCount()).toBe(3)

      grid.destroy()
      document.body.removeChild(container)
    }))

  it('core.L2.grid-cols-insert-delete-undo-redo tracks schema count and history', () => {
    const data = createMutableData()
    const { container, grid } = mountRecordingGrid({ data })

    const inserted = grid.insertCols(1, 1)
    expect(inserted).toHaveLength(1)
    expect(data.getSchema().fields).toHaveLength(5)
    expect(grid.canUndo()).toBe(true)

    grid.undo()
    expect(data.getSchema().fields).toHaveLength(4)
    expect(grid.canRedo()).toBe(true)

    grid.redo()
    expect(data.getSchema().fields).toHaveLength(5)

    grid.deleteCols(['b'])
    expect(data.getSchema().fields.map((field) => field.id)).not.toContain('b')
    expect(data.getSchema().fields).toHaveLength(4)

    grid.undo()
    expect(data.getSchema().fields.map((field) => field.id)).toContain('b')
    expect(data.getSchema().fields).toHaveLength(5)

    grid.redo()
    expect(data.getSchema().fields.map((field) => field.id)).not.toContain('b')
    expect(data.getSchema().fields).toHaveLength(4)

    grid.destroy()
    document.body.removeChild(container)
  })

  it('core.L2.grid-cols-hide-unhide-visible-count updates hidden columns and rendered schema', () =>
    withManualRaf((flushRaf) => {
      const { container, grid, recorder } = mountRecordingGrid({ data: createMutableData() })

      grid.hideCols(['b'])
      flushRaf()

      expect(grid.getHiddenCols()).toEqual(['b'])
      expect(schemaFieldIds(lastFrame(recorder).data)).toEqual(['a', 'c', 'd'])

      grid.unhideCols(['b'])
      flushRaf()

      expect(grid.getHiddenCols()).toEqual([])
      expect(schemaFieldIds(lastFrame(recorder).data)).toEqual(['a', 'b', 'c', 'd'])

      grid.destroy()
      document.body.removeChild(container)
    }))

  it('core.L2.grid-cols-move-callback reorders columns and emits callback', () => {
    const events: Array<{ fieldIds: readonly string[]; beforeFieldId: string | null }> = []
    const data = createMutableData()
    const { container, grid } = mountRecordingGrid({
      data,
      onColumnsMoved: (event) => events.push(event),
    })

    expect(grid.moveCols(['a'], null)).toBe(true)
    expect(schemaFieldIds(data)).toEqual(['b', 'c', 'd', 'a'])
    expect(events).toEqual([{ fieldIds: ['a'], beforeFieldId: null }])

    grid.undo()
    expect(schemaFieldIds(data)).toEqual(['a', 'b', 'c', 'd'])

    grid.redo()
    expect(schemaFieldIds(data)).toEqual(['b', 'c', 'd', 'a'])

    events.length = 0
    expect(grid.moveCols(['a'], null)).toBe(false)
    expect(events).toEqual([])

    grid.destroy()
    document.body.removeChild(container)
  })

  it('core.L2.grid-header-menu-row-actions exposes row menu and invokes insert-above', () => {
    const data = createMutableData()
    const { container, grid } = mountRecordingGrid({ data })
    grid.setSelection(singleCellSelection(1, 0))

    const ids = grid.getRowHeaderContextMenuItems({ targetRowIndex: 1 }).map((item) => item.id)

    expect(ids).toContain('insert-above')
    expect(ids).toContain('insert-below')
    expect(ids).toContain('delete-rows')
    expect(ids).toContain('hide-rows')
    expect(ids).toContain('resize-row-height')

    grid.invokeRowHeaderContextMenuAction('insert-above', { targetRowIndex: 1 })

    expect(data.getRowCount()).toBe(4)

    grid.destroy()
    document.body.removeChild(container)
  })

  it('core.L2.grid-header-menu-col-actions exposes column menu and invokes insert-col-left', () => {
    const data = createMutableData()
    const { container, grid } = mountRecordingGrid({ data })
    grid.setSelection(singleCellSelection(0, 1))

    const ids = grid.getColumnHeaderContextMenuItems({ targetColIndex: 1 }).map((item) => item.id)

    expect(ids).toContain('insert-col-left')
    expect(ids).toContain('insert-col-right')
    expect(ids).toContain('delete-cols')
    expect(ids).toContain('hide-cols')
    expect(ids).toContain('resize-column-width')

    grid.invokeColumnHeaderContextMenuAction('insert-col-left', { targetColIndex: 1 })

    expect(data.getSchema().fields).toHaveLength(5)

    grid.destroy()
    document.body.removeChild(container)
  })

const formatSchema: Schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text', width: 100 },
    { id: 'b', name: 'B', type: 'text', width: 100 },
    { id: 'c', name: 'C', type: 'text', width: 100 },
  ],
}

const valueFormatSchema: Schema = {
  fields: [{ id: 'amt', name: 'Amt', type: 'number', width: 100 }],
}

function createFormatData(): InMemoryDataSource {
  return new InMemoryDataSource({
    schema: formatSchema,
    rows: [
      { a: 'A1', b: 'B1', c: 'C1' },
      { a: 'A2', b: 'B2', c: 'C2' },
      { a: 'A3', b: 'B3', c: 'C3' },
    ] satisfies Row[],
  })
}

function createFormatEngine(): DefaultGridEngine {
  return new DefaultGridEngine({ data: createFormatData() })
}

function createValueFormatData(): InMemoryDataSource {
  return new InMemoryDataSource({
    schema: valueFormatSchema,
    rows: [{ amt: 1234.5 }] satisfies Row[],
  })
}

function dispatchGridDoubleClick(target: HTMLElement, point: { x: number; y: number }): void {
  target.dispatchEvent(
    new MouseEvent('dblclick', {
      bubbles: true,
      cancelable: true,
      clientX: point.x,
      clientY: point.y,
      button: 0,
    }),
  )
}

function dispatchGridPointerDown(target: HTMLElement, point: { x: number; y: number }): void {
  target.dispatchEvent(
    new MouseEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      clientX: point.x,
      clientY: point.y,
      button: 0,
    }),
  )
}

function dispatchGridKeyDown(target: HTMLElement, key: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key }))
}

function createActionHitBackend(actionId: string): RenderBackendFactory {
  return () => {
    const renderer = {
      mount(_container: HTMLElement): void {},
      resize(_width: number, _height: number, _dpr: number): void {},
      render(): void {},
      getCellActionAt() {
        return { rowIndex: 0, colIndex: 0, actionId }
      },
      destroy(): void {},
    }
    return {
      renderer,
      measurer: { measureWidth: (text: string) => text.length * 7 },
      createRenderer() {
        return renderer
      },
      resizeSurface(_width: number, _height: number): void {},
      destroy(): void {
        renderer.destroy()
      },
    }
  }
}

describe('Core BDD Batch 6 format merge theme scenarios', () => {
  it('core.L2.grid-custom-editor-open-triggers routes double-click, F2, Enter, typing, and API to custom editor', () =>
    withManualRaf((flushRaf) => {
      const data = new InMemoryDataSource({
        schema: {
          fields: [{ id: 'owner', name: 'Owner', type: 'assignee', width: 160 }],
        },
        rows: [{ owner: 'Alice' }] satisfies Row[],
      })
      const contexts: CellEditorOpenContext[] = []
      const editor = {
        open: mock((ctx: CellEditorOpenContext) => contexts.push(ctx)),
        close: mock(() => {}),
      }
      const { container, grid, recorder } = mountRecordingGrid({
        data,
        cellEditors: { assignee: editor },
      })
      const scrollHost = getScrollHost(container)

      dispatchGridDoubleClick(scrollHost, { x: 8, y: 36 })
      grid.setSelection(singleCellSelection(0, 0))
      dispatchGridKeyDown(scrollHost, 'F2')
      grid.setSelection(singleCellSelection(0, 0))
      dispatchGridKeyDown(scrollHost, 'Enter')
      grid.setSelection(singleCellSelection(0, 0))
      dispatchGridKeyDown(scrollHost, 'B')
      expect(grid.openCellEditor(0, 'owner')).toBe(true)

      contexts.at(-1)?.commit('Bob')
      flushRaf()

      expect(editor.open).toHaveBeenCalledTimes(5)
      expect(contexts.map((ctx) => ctx.trigger)).toEqual([
        'double-click',
        'f2',
        'enter',
        'typing',
        'api',
      ])
      expect(contexts[3]).toMatchObject({ trigger: 'typing', initialInput: 'B' })
      expect(contexts[4]).toMatchObject({
        cell: { rowIndex: 0, colIndex: 0 },
        field: { id: 'owner', type: 'assignee' },
        value: 'Alice',
        trigger: 'api',
      })
      expect(data.getCell(0, 'owner')).toBe('Bob')
      expect(lastFrame(recorder).data.getCell(0, 'owner')).toBe('Bob')

      grid.destroy()
      document.body.removeChild(container)
    }))

  it('core.L2.grid-cell-action-opens-editor calls onAction before editor fallback', () => {
    const data = new InMemoryDataSource({
      schema: {
        fields: [{ id: 'owner', name: 'Owner', type: 'assignee', width: 160 }],
      },
      rows: [{ owner: 'Alice' }] satisfies Row[],
    })
    const calls: string[] = []
    const onAction = mock((ctx) => {
      calls.push('onAction')
      expect(ctx.trigger).toBe('cell-action')
      expect(ctx.actionId).toBe('change-assignee')
    })
    const editor = {
      open: mock((ctx: CellEditorOpenContext) => {
        calls.push('editor.open')
        expect(ctx).toMatchObject({
          trigger: 'cell-action',
          actionId: 'change-assignee',
          cell: { rowIndex: 0, colIndex: 0 },
          field: { id: 'owner', type: 'assignee' },
          value: 'Alice',
        })
      }),
    }
    const container = document.createElement('div')
    Object.assign(container.style, { width: '400px', height: '300px' })
    document.body.appendChild(container)
    const grid = new Grid(container, {
      data,
      backend: createActionHitBackend('change-assignee'),
      cellTypes: { assignee: { onAction } satisfies CellTypeDefinition },
      cellEditors: { assignee: editor },
    })
    const scrollHost = getScrollHost(container)

    dispatchGridPointerDown(scrollHost, { x: 132, y: 44 })

    expect(calls).toEqual(['onAction', 'editor.open'])
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(editor.open).toHaveBeenCalledTimes(1)

    grid.destroy()
    document.body.removeChild(container)
  })

  it('core.L2.grid-format-fill-color-set-clear sets and clears fill through Grid facade', () => {
    const { container, grid } = mountRecordingGrid({ data: createFormatData() })
    const range = fillRange(0, 0, 0, 0)

    expect(grid.setFillColor(range, '#fff2cc')).toBe(true)
    expect(grid.getViewCellFormat(0, 0)?.fillColor).toBe('#fff2cc')

    expect(grid.setFillColor(range, null)).toBe(true)
    expect(grid.getViewCellFormat(0, 0)?.fillColor).toBeUndefined()

    grid.destroy()
    document.body.removeChild(container)
  })

  it('core.L2.grid-format-borders-presets applies outer borders and perimeter patches', () => {
    const { container, grid } = mountRecordingGrid({ data: createFormatData() })
    const range = fillRange(0, 2, 0, 2)
    const border: BorderStyle = { color: '#d93025', width: 'thin', lineStyle: 'solid' }

    expect(grid.setBorders(range, 'outer', border)).toBe(true)
    expect(grid.getViewCellFormat(0, 0)?.borders?.top?.color).toBe('#d93025')
    expect(borderPatchForCell(range, 1, 1, 'outer', border)).toEqual({})
    expect(borderPatchForCell(range, 0, 0, 'outer', border)).toEqual({ top: border, left: border })

    grid.destroy()
    document.body.removeChild(container)
  })

  it('core.L2.grid-format-text-wrap-cycle cycles overflow wrap and clip modes', () => {
    const { container, grid } = mountRecordingGrid({ data: createFormatData() })
    const range = fillRange(0, 0, 0, 0)

    for (const mode of ['overflow', 'wrap', 'clip'] as const) {
      expect(grid.setTextWrap(range, mode)).toBe(true)
      expect(grid.getViewCellFormat(0, 0)?.textWrap).toBe(mode)
    }

    grid.destroy()
    document.body.removeChild(container)
  })

  it('core.L2.grid-format-value-number-currency-date stores value format descriptors', () => {
    // formatValue 的 number/currency/percent/date 输出矩阵已由
    // core.L0.format-value-number 黄金文件覆盖（functional/data-ops），此处只保留 facade 持久化契约。
    const { container, grid } = mountRecordingGrid({ data: createValueFormatData() })
    const range = fillRange(0, 0, 0, 0)
    const percentFormat = { kind: 'percent', decimals: 1 } as const

    expect(grid.setValueFormat(range, percentFormat)).toBe(true)
    expect(grid.getViewCellFormat(0, 0)?.valueFormat).toEqual(percentFormat)

    grid.destroy()
    document.body.removeChild(container)
  })

  it('core.L2.grid-merge-unmerge-region merges and unmerges through Grid facade', () => {
    const { container, grid } = mountRecordingGrid({ data: createFormatData() })
    const range = fillRange(0, 1, 0, 1)

    expect(grid.mergeCells(range)).toBe(true)
    expect(grid.getViewMergeRegion(1, 1)?.range).toEqual(range)

    expect(grid.unmergeCells(range)).toBe(true)
    expect(grid.getViewMergeRegion(0, 0)).toBeNull()

    grid.destroy()
    document.body.removeChild(container)
  })

  it('core.L2.grid-merge-format-survives-structure-undo realigns format and merge on undo', () => {
    const engine = createFormatEngine()

    engine.setFillColor(fillRange(1, 1, 1, 1), '#fff2cc')
    engine.insertRows(1, 1)
    expect(engine.getCellFormat(2, 1)?.fillColor).toBe('#fff2cc')

    engine.undo()
    expect(engine.getCellFormat(1, 1)?.fillColor).toBe('#fff2cc')
    expect(engine.getCellFormat(2, 1)).toBeUndefined()

    engine.redo()
    expect(engine.getCellFormat(2, 1)?.fillColor).toBe('#fff2cc')

    engine.mergeCells(fillRange(0, 1, 1, 2))
    engine.deleteCols(['b'])
    expect(engine.getMergeRegion(0, 1)).toBeNull()

    engine.undo()
    expect(engine.getMergeRegion(0, 1)?.range).toEqual({
      startRow: 0,
      endRow: 1,
      startCol: 1,
      endCol: 2,
    })
  })

  it('core.L2.grid-cell-type-override-api sets, clears, reads, and undoes view-coordinate cell type overrides', () => {
    const data = new InMemoryDataSource({
      schema: {
        fields: [
          { id: 'name', name: 'Name', type: 'text', width: 120 },
          { id: 'due', name: 'Due', type: 'date', width: 100 },
          { id: 'score', name: 'Score', type: 'number', width: 80 },
        ],
      },
      rows: [
        { name: 'raw0', due: 45000, score: 20 },
        { name: 'raw1', due: 45001, score: 30 },
        { name: 'raw2', due: 45002, score: 10 },
      ],
    })
    const { container, grid } = mountRecordingGrid({ data })

    expect(grid.getCellType(0, 1)).toBe('date')
    expect(grid.setCellType(fillRange(0, 0, 1, 1), 'text')).toBe(true)
    expect(grid.getCellType(0, 1)).toBe('text')
    expect(grid.clearCellType(fillRange(0, 0, 1, 1))).toBe(true)
    expect(grid.getCellType(0, 1)).toBe('date')
    grid.undo()
    expect(grid.getCellType(0, 1)).toBe('text')
    grid.redo()
    expect(grid.getCellType(0, 1)).toBe('date')

    grid.hideCols(['name'])
    expect(grid.getSortLayer().setSpec({ fieldId: 'score', direction: 'asc' })).toBe(true)
    expect(grid.setCellType(fillRange(0, 0, 0, 0), 'number')).toBe(true)
    expect(grid.getCellType(0, 0)).toBe('number')

    expect(grid.getSortLayer().setSpec({ fieldId: 'score', direction: 'desc' })).toBe(true)
    expect(grid.getCellType(0, 0)).toBe('date')
    expect(grid.getCellType(2, 0)).toBe('number')
    expect(grid.clearCellType(fillRange(2, 2, 0, 0))).toBe(true)
    expect(grid.getCellType(2, 0)).toBe('date')

    expect(grid.getSortLayer().setSpec({ fieldId: 'score', direction: 'asc' })).toBe(true)
    expect(grid.setCellType(fillRange(0, 1, 0, 0), 'checkbox')).toBe(false)
    expect(grid.getCellType(0, 0)).toBe('date')
    expect(grid.getCellType(1, 0)).toBe('date')

    grid.destroy()
    document.body.removeChild(container)
  })

  it('core.L2.grid-cell-type-edit-display uses resolved type for default date display and edit parsing', () => {
    const serial = dateToSerial(new Date(Date.UTC(2025, 0, 15)))
    const engine = new DefaultGridEngine({
      data: new InMemoryDataSource({
        schema: { fields: [{ id: 'v', name: 'V', type: 'text', width: 100 }] },
        rows: [{ v: serial }],
      }),
    })

    engine.setCellType(fillRange(0, 0, 0, 0), 'date')
    const frame = engine.getFrame()
    const field = frame.data.getSchema().fields[0]!
    expect(frame.resolveCellType?.(0, 0, field)).toBe('date')
    expect(frame.formatCell?.(0, 0, field, serial)).toBe('2025-01-15')

    expect(engine.beginCellEdit({ rowIndex: 0, colIndex: 0 })).toBe(true)
    engine.updateCellEditDraft('2025-01-16')
    expect(engine.commitCellEdit()).toBe(true)
    expect(engine.getData().getCell(0, 'v')).toBe(dateToSerial(new Date(Date.UTC(2025, 0, 16))))
  })
})
})
