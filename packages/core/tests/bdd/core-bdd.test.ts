import { describe, expect, it } from 'bun:test'

import {
  DEFAULT_EXCEL_WORKSPACE_POLICY,
  DefaultGridEngine,
  ExcelWorkspaceController,
  Grid,
  InMemoryDataSource,
  SparseExcelDataSource,
  decideExcelWorkspaceResize,
  denseGridTheme,
  formatValue,
  type DataSourceEvent,
  type ExcelWorkspacePort,
  type GridEngineFrameSource,
  type GridSelection,
  type RenderBackend,
  type RenderBackendFactory,
  type RenderBackendHandle,
  type RenderFrame,
  type Row,
  type Schema,
  type Theme,
  type TextMeasurer,
} from '../../src'

const schema: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 120 },
    { id: 'score', name: 'Score', type: 'number', width: 80 },
  ],
}

function createDenseData(): InMemoryDataSource {
  return new InMemoryDataSource({
    schema,
    rows: [
      { name: 'Ada', score: 10 },
      { name: 'Grace', score: 20 },
    ] satisfies Row[],
  })
}

const mutableSchema: Schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text', width: 100 },
    { id: 'b', name: 'B', type: 'number', width: 80, defaultValue: 0 },
    { id: 'c', name: 'C', type: 'text', width: 100 },
    { id: 'd', name: 'D', type: 'text', width: 100 },
  ],
}

function createMutableData(): InMemoryDataSource {
  return new InMemoryDataSource({
    schema: mutableSchema,
    rows: [
      { a: 'r0', b: 10, c: 'c0', d: 'd0' },
      { a: 'r1', b: 20, c: 'c1', d: 'd1' },
      { a: 'r2', b: 30, c: 'c2', d: 'd2' },
    ] satisfies Row[],
  })
}

describe('Core BDD Batch 0 smoke scenarios', () => {
  it('core.L1.engine-frame-initial-visible-range observes initial engine frame', () => {
    const engine = new DefaultGridEngine({ data: createDenseData() })
    engine.setViewportSize(400, 240)

    const frame = engine.getFrame()
    const firstField = frame.data.getSchema().fields[0]

    expect(frame.rowsAxis.getCount()).toBe(2)
    expect(frame.colsAxis.getCount()).toBe(2)
    expect(firstField).toBeDefined()
    expect(frame.data.getCell(0, firstField!.id)).toBe('Ada')
  })

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

  it('core.L0.datasource-in-memory-read-cell reads cells and inclusive rows', () => {
    const data = createDenseData()

    expect(data.getCell(0, 'name')).toBe('Ada')
    expect(data.getCell(1, 'score')).toBe(20)
    expect(data.getRows(0, 1)).toHaveLength(2)
  })

  it('core.L0.format-value-number formats number descriptors', () => {
    expect(
      formatValue(
        1234.5,
        { kind: 'number', decimals: 2 },
        {
          field: { id: 'amount', name: 'Amount', type: 'number', width: 100 },
          locale: 'en-US',
        },
        {},
      ),
    ).toBe('1,234.50')
  })
})

describe('Core BDD Batch 1 datasource and workspace scenarios', () => {
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

  it('core.L2.grid-events-on-off delivers and unsubscribes public events', () => {
    const { container, grid } = mountRecordingGrid()
    const sortEvents: unknown[] = []
    const undoEvents: unknown[] = []
    const redoEvents: unknown[] = []

    const offSort = grid.on('sortChange', (event) => sortEvents.push(event))
    grid.getSortLayer().setSpec({ fieldId: 'score', direction: 'asc' })
    offSort()
    grid.getSortLayer().setSpec({ fieldId: 'score', direction: 'desc' })

    const offUndo = grid.onUndo((event) => undoEvents.push(event.command.kind))
    const offRedo = grid.onRedo((event) => redoEvents.push(event.command.kind))
    const offFill = grid.onFill(() => {})

    grid.insertRows(1, 1)
    grid.undo()
    grid.redo()
    offUndo()
    offRedo()
    offFill()

    expect(sortEvents).toEqual([{ spec: { fieldId: 'score', direction: 'asc' } }])
    expect(undoEvents).toEqual(['insertRows'])
    expect(redoEvents).toEqual(['insertRows'])

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

describe('Core BDD Batch 3 row and column structure scenarios', () => {
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

  it('core.L1.engine-rows-move-undo-redo reorders rows through engine history', () => {
    const data = createMutableData()
    const engine = new DefaultGridEngine({ data })

    expect(engine.moveRows([1, 2], 0)).toBe(true)
    expect(rowOrder(data)).toEqual(['r1', 'r2', 'r0'])
    expect(engine.canUndo()).toBe(true)

    engine.undo()
    expect(rowOrder(data)).toEqual(['r0', 'r1', 'r2'])
    expect(engine.canRedo()).toBe(true)

    engine.redo()
    expect(rowOrder(data)).toEqual(['r1', 'r2', 'r0'])
  })

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
})

const noopMeasurer: TextMeasurer = {
  measureWidth: (text) => text.length * 7,
}

interface RenderRecorder {
  frames: RenderFrame[]
  destroyCalls: number
}

function mountRecordingGrid(
  options: {
    data?: InMemoryDataSource
    onColumnsMoved?: (event: { fieldIds: readonly string[]; beforeFieldId: string | null }) => void
  } = {},
): {
  container: HTMLElement
  grid: Grid
  recorder: RenderRecorder
} {
  const container = document.createElement('div')
  Object.assign(container.style, { width: '400px', height: '300px' })
  document.body.appendChild(container)
  const { backend, recorder } = createRecordingBackend()
  const grid = new Grid(container, {
    data: options.data ?? createDenseData(),
    backend,
    onColumnsMoved: options.onColumnsMoved,
  })
  return { container, grid, recorder }
}

function createRecordingBackend(): {
  backend: RenderBackendFactory
  recorder: RenderRecorder
} {
  const recorder: RenderRecorder = { frames: [], destroyCalls: 0 }
  const backend: RenderBackendFactory = (): RenderBackendHandle => {
    let renderer = createRecordingRenderer(recorder)
    return {
      renderer,
      measurer: noopMeasurer,
      createRenderer(_engine: GridEngineFrameSource): RenderBackend {
        renderer = createRecordingRenderer(recorder)
        return renderer
      },
      resizeSurface(_width: number, _height: number): void {},
      destroy(): void {
        renderer.destroy()
      },
    }
  }
  return { backend, recorder }
}

function createRecordingRenderer(recorder: RenderRecorder): RenderBackend {
  return {
    mount(_container: HTMLElement): void {},
    resize(_width: number, _height: number, _dpr: number): void {},
    render(frame: RenderFrame): void {
      recorder.frames.push(frame)
    },
    destroy(): void {
      recorder.destroyCalls += 1
    },
  }
}

function lastFrame(recorder: RenderRecorder): RenderFrame {
  const frame = recorder.frames.at(-1)
  if (frame === undefined) throw new Error('expected at least one render frame')
  return frame
}

function withManualRaf<T>(run: (flushRaf: () => void) => T): T {
  const original = globalThis.requestAnimationFrame
  const callbacks: FrameRequestCallback[] = []
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
    callbacks.push(callback)
    return callbacks.length
  }) as typeof requestAnimationFrame
  const flushRaf = () => {
    while (callbacks.length > 0) callbacks.shift()!(0)
  }
  try {
    return run(flushRaf)
  } finally {
    globalThis.requestAnimationFrame = original
  }
}

function getScrollHost(container: HTMLElement): HTMLElement {
  const scrollHost = container.querySelector<HTMLElement>('[data-novasheet-scroll-host]')
  if (scrollHost === null) throw new Error('expected Grid scroll host')
  return scrollHost
}

function createScrollData(): InMemoryDataSource {
  return new InMemoryDataSource({
    schema,
    rows: Array.from({ length: 50 }, (_, index) => ({
      name: `row ${index}`,
      score: index,
    })) satisfies Row[],
  })
}

function createWrapData(): InMemoryDataSource {
  return new InMemoryDataSource({
    schema: {
      fields: [
        { id: 'notes', name: 'Notes', type: 'text', width: 44, wrap: true },
        { id: 'score', name: 'Score', type: 'number', width: 80 },
      ],
    },
    rows: [
      {
        notes: 'alpha beta gamma delta epsilon zeta',
        score: 1,
      },
    ] satisfies Row[],
  })
}

function rowOrder(data: InMemoryDataSource): string[] {
  return data.getRows(0, data.getRowCount() - 1).map((row) => String(row.a))
}

function schemaFieldIds(source: { getSchema(): Schema }): string[] {
  return source.getSchema().fields.map((field) => field.id)
}

function singleCellSelection(rowIndex: number, colIndex: number): GridSelection {
  return {
    activeCell: { rowIndex, colIndex },
    anchorCell: { rowIndex, colIndex },
    extentCell: { rowIndex, colIndex },
    selectedRange: {
      startRow: rowIndex,
      endRow: rowIndex,
      startCol: colIndex,
      endCol: colIndex,
    },
  }
}

const createNoopBackend: RenderBackendFactory = (): RenderBackendHandle => {
  let renderer = createNoopRenderer()
  return {
    renderer,
    measurer: noopMeasurer,
    createRenderer(_engine: GridEngineFrameSource): RenderBackend {
      renderer = createNoopRenderer()
      return renderer
    },
    resizeSurface(_width: number, _height: number): void {},
    destroy(): void {
      renderer.destroy()
    },
  }
}

function createWorkspacePort(): ExcelWorkspacePort & {
  appendedRows: number
  size: { rowCount: number; colCount: number }
} {
  const port = {
    appendedRows: 0,
    size: { rowCount: 100, colCount: 10 },
    getSize() {
      return this.size
    },
    getVisibleRange() {
      return { rows: [92, 99], cols: [0, 4] } as const
    },
    getContentBounds() {
      return { startRow: 0, endRow: 98, startCol: 0, endCol: 3 }
    },
    hasMaterializedRows(_start: number, _end: number) {
      return true
    },
    hasMaterializedCols(_start: number, _end: number) {
      return false
    },
    appendRows(count: number) {
      this.appendedRows += count
      this.size = { ...this.size, rowCount: this.size.rowCount + count }
    },
    appendCols(count: number) {
      this.size = { ...this.size, colCount: this.size.colCount + count }
    },
    resizeWorkspace(size: { rowCount: number; colCount: number }) {
      this.size = size
    },
  }
  return port
}

function createNoopRenderer(): RenderBackend {
  return {
    mount(_container: HTMLElement): void {},
    resize(_width: number, _height: number, _dpr: number): void {},
    render(_frame: RenderFrame): void {},
    destroy(): void {},
  }
}
