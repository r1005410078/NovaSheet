import { describe, expect, it, mock, spyOn } from 'bun:test'
import {
  DEFAULT_EXCEL_WORKSPACE_POLICY,
  FilterLayer,
  InMemoryDataSource,
  SortLayer,
  SparseExcelDataSource,
  ViewPipeline,
} from '@novasheet/core'
import type {
  CellAddress,
  CellEditorOpenContext,
  DataSource,
  GridEngine,
  GridSelection,
  ResizeHandleRect,
  Row,
  Schema,
  Theme,
} from '@novasheet/core'
import type { WebHost } from '@novasheet/core'
import type { RenderBackend } from '@novasheet/core'
import { GridRuntime } from '@novasheet/core'

function makeEngine(): GridEngine {
  return {
    setData: mock(() => {}),
    setViewData: mock(() => {}),
    resizeExcelWorkspace: mock(() => false),
    setTheme: mock(() => {}),
    setFrozen: mock(() => {}),
    setViewportSize: mock(() => {}),
    setHeaderHeight: mock(() => {}),
    setScroll: mock(() => {}),
    setRowHeight: mock(() => {}),
    getRowHeight: mock(() => 28),
    setColumnWidth: mock(() => {}),
    selectCell: mock(() => {}),
    navigateSelection: mock(() => false),
    beginCellEdit: mock(() => false),
    updateCellEditDraft: mock(() => {}),
    cancelCellEdit: mock(() => {}),
    commitCellEdit: mock(() => false),
    commitCellValue: mock(() => false),
    isCellEditing: mock(() => false),
    clearRange: mock(() => {}),
    clearSelection: mock(() => {}),
    getSelection: mock(
      () =>
        ({
          activeCell: null,
          anchorCell: null,
          extentCell: null,
          selectedRange: null,
        }) satisfies GridSelection,
    ),
    getFrame: mock(() => ({
      data: {} as DataSource,
      theme: { metrics: { headerHeight: 32 } } as Theme,
      rowsAxis: {
        getCount: () => 10,
        positionToIndex: (pos: number) => Math.floor(pos / 28),
      } as never,
      colsAxis: {
        positionToIndex: (pos: number) => Math.floor(pos / 100),
      } as never,
      viewport: {
        contentRect: { width: 400, height: 300 },
        regions: [
          {
            id: 'main',
            rowBand: 'middle',
            colBand: 'center',
            rowRange: [0, 9],
            colRange: [0, 2],
            rect: { x: 0, y: 32, width: 300, height: 268 },
            scrollOffsetX: 0,
            scrollOffsetY: 0,
            zIndex: 10,
          },
        ],
      } as never,
      collapsedRowGaps: [],
      collapsedColGaps: [],
    })),
    getRowsTotalSize: () => 280,
    getColsTotalSize: () => 200,
    getColumnIndex: () => 0,
    getTheme: () => ({ metrics: { headerHeight: 32, rowHeight: 28 } }) as Theme,
    getRowsAxis: () =>
      ({
        getCount: () => 10,
        indexToPosition: (i: number) => i * 28,
        getSize: () => 28,
      }) as never,
    getColsAxis: () =>
      ({
        indexToPosition: () => 0,
      }) as never,
    getViewport: mock(() => ({ getRowHeaderWidth: () => 0 }) as never),
    getData: mock(() => ({}) as never),
    undo: mock(() => undefined),
    redo: mock(() => undefined),
    canUndo: mock(() => false),
    canRedo: mock(() => false),
    commitRowResize: mock(() => {}),
    commitColumnResize: mock(() => {}),
    commitPaste: mock(() => {}),
    commitFill: mock(() => null),
    getFillMergeSnap: mock(() => ({ rowSpan: 1, colSpan: 1 })),
    unhideRows: mock(() => {}),
    getHiddenRows: mock(() => [] as readonly number[]),
    insertRows: mock(() => [] as readonly number[]),
    deleteRows: mock(() => {}),
    hideRows: mock(() => {}),
    setRowHeights: mock(() => {}),
    setSelection: mock(() => {}),
    insertCols: mock(() => [] as never),
    deleteCols: mock(() => [] as never),
    hideCols: mock(() => {}),
    unhideCols: mock(() => {}),
    setColumnWidths: mock(() => {}),
    getHiddenCols: mock(() => [] as readonly string[]),
    getFrozenConfig: mock(() => ({ topRows: 0, leftCols: 0, rightCols: 0 })),
    moveCols: mock(() => false),
    moveRows: mock(() => false),
    setFillColor: mock(() => false),
    setBorders: mock(() => false),
    setValueFormat: mock(() => false),
    setTextWrap: mock(() => false),
    getCellFormat: mock(() => undefined),
    getViewCellFormat: mock(() => undefined),
    mergeCells: mock(() => false),
    unmergeCells: mock(() => false),
    getMergeRegion: mock(() => null),
    getViewMergeRegion: mock(() => null),
  }
}

function makeHost(): WebHost {
  return {
    attach: mock(() => {}),
    applyScrollbarTheme: mock(() => {}),
    setScrollSize: mock(() => {}),
    setCursor: mock(() => {}),
    scrollTo: mock(() => {}),
    getDpr: () => 1,
    getContainerSize: () => ({ width: 400, height: 300 }),
    getContainerBoundingRect: () => ({ left: 0, top: 0 }),
    getScrollPosition: () => ({ scrollTop: 0, scrollLeft: 0 }),
    focusScrollHost: mock(() => {}),
    destroy: mock(() => {}),
  }
}

function makeRenderer(): RenderBackend {
  return {
    mount: mock(() => {}),
    resize: mock(() => {}),
    render: mock(() => {}),
    destroy: mock(() => {}),
  }
}

function makeFrameWithFields(
  fields: Schema['fields'],
  rows: readonly Row[] = [{ owner: 'Alice' }],
) {
  const data = new InMemoryDataSource({
    rows: [...rows],
    schema: { fields },
  })
  return {
    data,
    theme: { metrics: { headerHeight: 32 } } as Theme,
    rowsAxis: {
      getCount: () => rows.length,
      positionToIndex: (pos: number) => Math.floor(pos / 28),
      indexToPosition: (i: number) => i * 28,
      getSize: () => 28,
    } as never,
    colsAxis: {
      getCount: () => fields.length,
      positionToIndex: (pos: number) => Math.floor(pos / 160),
      indexToPosition: (i: number) => i * 160,
      getSize: (i: number) => fields[i]?.width ?? 160,
    } as never,
    viewport: {
      contentRect: { width: 400, height: 300 },
      regions: [
        {
          id: 'main',
          rowBand: 'middle',
          colBand: 'center',
          rowRange: [0, rows.length - 1],
          colRange: [0, fields.length - 1],
          rect: { x: 0, y: 32, width: fields.length * 160, height: 268 },
          scrollOffsetX: 0,
          scrollOffsetY: 0,
          zIndex: 10,
        },
      ],
    } as never,
    collapsedRowGaps: [],
    collapsedColGaps: [],
  }
}

function makeExcelHeaderRuntime(options: { rowHeaderWidth?: number; columnWidth?: number } = {}) {
  const rowHeaderWidth = options.rowHeaderWidth ?? 48
  const columnWidth = options.columnWidth ?? 100
  const schema: Schema = {
    fields: [
      { id: 'name', name: 'Name', type: 'text', width: columnWidth },
      { id: 'score', name: 'Score', type: 'number', width: columnWidth },
    ],
  }
  const data = new InMemoryDataSource({
    rows: [
      { name: 'Ada', score: 2 },
      { name: 'Grace', score: 1 },
    ],
    schema,
  })
  const engine = makeEngine()
  engine.getData = mock(() => data as never)
  engine.getViewport = mock(() => ({ getRowHeaderWidth: () => rowHeaderWidth }) as never)
  engine.getFrame = mock(() => ({
    data,
    theme: { metrics: { headerHeight: 32 } } as Theme,
    rowsAxis: {
      getCount: () => data.getRowCount(),
      positionToIndex: (pos: number) => Math.floor(pos / 28),
      indexToPosition: (i: number) => i * 28,
      getSize: () => 28,
    } as never,
    colsAxis: {
      getCount: () => schema.fields.length,
      getTotalSize: () => schema.fields.length * columnWidth,
      positionToIndex: (pos: number) =>
        Math.max(0, Math.min(schema.fields.length - 1, Math.floor(pos / columnWidth))),
      indexToPosition: (i: number) => i * columnWidth,
      getSize: () => columnWidth,
    } as never,
    viewport: {
      contentRect: { width: 400, height: 300 },
      rowHeaderWidth,
      scrollX: 0,
      scrollY: 0,
      regions: [
        {
          id: 'main',
          rowBand: 'middle',
          colBand: 'center',
          rowRange: [0, data.getRowCount() - 1],
          colRange: [0, schema.fields.length - 1],
          rect: { x: rowHeaderWidth, y: 32, width: schema.fields.length * columnWidth, height: 268 },
          scrollOffsetX: 0,
          scrollOffsetY: 0,
          zIndex: 10,
        },
      ],
    } as never,
    collapsedRowGaps: [],
    collapsedColGaps: [],
  }))
  const host = makeHost()
  const runtime = new GridRuntime({ engine, host, renderer: makeRenderer() })
  return { engine, runtime, host }
}

describe('GridRuntime.replaceRenderer — 更换渲染器', () => {
  it('销毁旧 renderer 并安装 factory 产物', () => {
    const engine = makeEngine()
    const host = makeHost()
    const first = makeRenderer()
    const second = makeRenderer()
    const runtime = new GridRuntime({ engine, host, renderer: first })

    const installed = runtime.replaceRenderer(() => second)

    expect(first.destroy).toHaveBeenCalledTimes(1)
    expect(installed).toBe(second)
    expect(second.destroy).not.toHaveBeenCalled()
  })
})

describe('GridRuntime excelWorkspace — wheel auto grow', () => {
  it('wheel scroll at materialized bottom edge resizes workspace through engine', () => {
    const data = new SparseExcelDataSource()
    data.updateCell(999, 'A', 'edge')
    const engine = makeEngine()
    const resizeExcelWorkspace = mock((size: { rowCount: number; colCount: number }) => {
      data.resizeWorkspace(size)
      return true
    })
    engine.getData = mock(() => data as never)
    engine.resizeExcelWorkspace = resizeExcelWorkspace
    engine.getFrame = mock(() => ({
      data,
      theme: { metrics: { headerHeight: 32 } } as Theme,
      rowsAxis: {
        getCount: () => data.getRowCount(),
        positionToIndex: (pos: number) => Math.floor(pos / 28),
        indexToPosition: (i: number) => i * 28,
        getSize: () => 28,
        getVisibleRange: () => [970, data.getRowCount() - 1],
      } as never,
      colsAxis: {
        getCount: () => data.getSchema().fields.length,
        getTotalSize: () => data.getSchema().fields.length * 96,
        positionToIndex: (pos: number) => Math.floor(pos / 96),
        indexToPosition: (i: number) => i * 96,
        getSize: () => 96,
        getVisibleRange: () => [0, 25],
      } as never,
      viewport: {
        contentRect: { width: 400, height: 300 },
        scrollX: 0,
        scrollY: 0,
        rowHeaderWidth: 0,
        regions: [
          {
            id: 'main',
            rowBand: 'middle',
            colBand: 'center',
            rowRange: [970, data.getRowCount() - 1],
            colRange: [0, 25],
            rect: { x: 0, y: 32, width: 400, height: 268 },
            scrollOffsetX: 0,
            scrollOffsetY: 0,
            zIndex: 10,
          },
        ],
      } as never,
      collapsedRowGaps: [],
      collapsedColGaps: [],
    }))
    const host = makeHost()
    const runtime = new GridRuntime({
      engine,
      host,
      renderer: makeRenderer(),
      excelWorkspace: { policy: DEFAULT_EXCEL_WORKSPACE_POLICY },
    })

    runtime.handleHostScroll(10_000, 0, {
      kind: 'wheel',
      atMs: Date.now(),
      deltaX: 0,
      deltaY: 120,
    })

    expect(resizeExcelWorkspace).toHaveBeenCalledWith({ rowCount: 1_200, colCount: 26 })
    expect(host.setScrollSize).toHaveBeenCalled()
  })

  it('scrollbar drag at materialized bottom edge does not grow workspace', () => {
    const data = new SparseExcelDataSource()
    data.updateCell(999, 'A', 'edge')
    const engine = makeEngine()
    const resizeExcelWorkspace = mock(() => true)
    engine.getData = mock(() => data as never)
    engine.resizeExcelWorkspace = resizeExcelWorkspace
    engine.getFrame = mock(() => ({
      data,
      theme: { metrics: { headerHeight: 32 } } as Theme,
      rowsAxis: {} as never,
      colsAxis: {} as never,
      viewport: {
        contentRect: { width: 400, height: 300 },
        regions: [
          {
            id: 'main',
            rowBand: 'middle',
            colBand: 'center',
            rowRange: [970, 999],
            colRange: [0, 25],
            rect: { x: 0, y: 32, width: 400, height: 268 },
            scrollOffsetX: 0,
            scrollOffsetY: 0,
            zIndex: 10,
          },
        ],
      } as never,
      collapsedRowGaps: [],
      collapsedColGaps: [],
    }))
    const runtime = new GridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      excelWorkspace: true,
    })

    runtime.handleHostScroll(10_000, 0, { kind: 'scrollbar', atMs: Date.now() })

    expect(resizeExcelWorkspace).not.toHaveBeenCalled()
  })
})

describe('GridRuntime.setData — 换数据', () => {
  it('更新 engine、经 factory 换 renderer 并 refresh', () => {
    const engine = makeEngine()
    const host = makeHost()
    const first = makeRenderer()
    const second = makeRenderer()
    const runtime = new GridRuntime({ engine, host, renderer: first })
    const refreshSpy = spyOn(runtime, 'refresh')

    const data = {} as DataSource
    const installed = runtime.setData(data, () => second)

    expect(engine.setData).toHaveBeenCalledWith(data)
    expect(first.destroy).toHaveBeenCalledTimes(1)
    expect(installed).toBe(second)
    expect(engine.setViewportSize).toHaveBeenCalledWith(400, 300)
    expect(host.setScrollSize).toHaveBeenCalled()
    expect(refreshSpy).toHaveBeenCalled()
  })
})

describe('GridRuntime.scheduleHostResize — 合并 resize', () => {
  it('合并 resize 回调，RAF 内 paintSync', () => {
    const engine = makeEngine()
    const host = makeHost()
    const renderer = makeRenderer()
    const onSurfaceResize = mock(() => {})
    const runtime = new GridRuntime({ engine, host, renderer, onSurfaceResize })

    const rafs: Array<FrameRequestCallback> = []
    const originalRaf = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      rafs.push(cb)
      return rafs.length
    }) as typeof requestAnimationFrame

    runtime.handleHostResize(100, 100, 1)
    runtime.handleHostResize(200, 200, 1)
    expect(engine.setViewportSize).not.toHaveBeenCalled()
    expect(renderer.render).not.toHaveBeenCalled()

    rafs[rafs.length - 1]!(performance.now())
    expect(engine.setViewportSize).toHaveBeenCalledTimes(1)
    expect(engine.setViewportSize).toHaveBeenCalledWith(400, 300)
    expect(onSurfaceResize).toHaveBeenCalledTimes(1)
    expect(renderer.render).toHaveBeenCalledTimes(1)

    globalThis.requestAnimationFrame = originalRaf
  })
})

describe('GridRuntime.setTheme — 换主题', () => {
  it('更新 engine、可选 patch renderer 后 refresh', () => {
    const engine = makeEngine()
    const host = makeHost()
    const renderer = makeRenderer()
    const runtime = new GridRuntime({ engine, host, renderer })
    const refreshSpy = spyOn(runtime, 'refresh')
    const patch = mock(() => {})

    const theme = { metrics: { headerHeight: 40, rowHeight: 32 } } as Theme
    runtime.setTheme(theme, patch)

    expect(engine.setTheme).toHaveBeenCalledWith(theme)
    expect(host.applyScrollbarTheme).toHaveBeenCalled()
    expect(patch).toHaveBeenCalledWith(renderer)
    expect(refreshSpy).toHaveBeenCalled()
  })
})

describe('GridRuntime.handleHostPointerDown — 点击选择', () => {
  it('命中 body 单元格后更新 selection 并请求重绘', () => {
    const engine = makeEngine()
    const host = makeHost()
    const renderer = makeRenderer()
    const runtime = new GridRuntime({ engine, host, renderer })
    const refreshSpy = spyOn(runtime, 'refresh')

    runtime.handleHostPointerDown({ x: 120, y: 72, shiftKey: false })

    expect(engine.selectCell).toHaveBeenCalledWith({
      rowIndex: 1,
      colIndex: 1,
    } satisfies CellAddress)
    expect(refreshSpy).toHaveBeenCalled()
  })

  it('按住 Shift 点击时扩展选区', () => {
    const engine = makeEngine()
    const host = makeHost()
    const renderer = makeRenderer()
    const runtime = new GridRuntime({ engine, host, renderer })

    runtime.handleHostPointerDown({ x: 120, y: 72, shiftKey: true })

    expect(engine.selectCell).toHaveBeenCalledWith(
      { rowIndex: 1, colIndex: 1 } satisfies CellAddress,
      { extend: true },
    )
  })

  it('水平 spacer 含行号 gutter（与垂直加 headerH 对称，消除右缘缺口）', () => {
    // gutter=48，列总宽 200（base mock），headerH=32，行总高 280。
    const { runtime, host } = makeExcelHeaderRuntime({ rowHeaderWidth: 48 })
    runtime.attach()
    // 水平 spacer = colsTotal(200) + gutter(48) = 248；垂直 = rowsTotal(280) + headerH(32) = 312。
    expect(host.setScrollSize).toHaveBeenCalledWith(248, 312)
  })

  it('Excel 行头左键选中整行', () => {
    const { engine, runtime } = makeExcelHeaderRuntime({ rowHeaderWidth: 48 })

    runtime.handleHostPointerDown({ x: 24, y: 72, shiftKey: false })

    expect(engine.setSelection).toHaveBeenCalledWith({
      activeCell: { rowIndex: 1, colIndex: 0 },
      anchorCell: { rowIndex: 1, colIndex: 0 },
      extentCell: { rowIndex: 1, colIndex: 1 },
      selectedRange: { startRow: 1, endRow: 1, startCol: 0, endCol: 1 },
    } satisfies GridSelection)
    expect(engine.selectCell).not.toHaveBeenCalled()
  })

  it('Excel 行头拖动扩展为连续整行选区', () => {
    const { engine, runtime } = makeExcelHeaderRuntime({ rowHeaderWidth: 48 })

    runtime.handleHostPointerDown({ x: 24, y: 44, shiftKey: false })
    runtime.handleHostPointerMove({ x: 24, y: 72, shiftKey: false })
    runtime.handleHostPointerUp()

    expect(engine.setSelection).toHaveBeenNthCalledWith(1, {
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 0, colIndex: 1 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 1 },
    } satisfies GridSelection)
    expect(engine.setSelection).toHaveBeenNthCalledWith(2, {
      activeCell: { rowIndex: 1, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 1, colIndex: 1 },
      selectedRange: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
    } satisfies GridSelection)
    expect(engine.selectCell).not.toHaveBeenCalled()
  })

  it('Excel 行头 Shift 点击从既有整行锚点扩展', () => {
    const { engine, runtime } = makeExcelHeaderRuntime({ rowHeaderWidth: 48 })
    engine.getSelection = mock(() => ({
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 0, colIndex: 1 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 1 },
    }))

    runtime.handleHostPointerDown({ x: 24, y: 72, shiftKey: true })

    expect(engine.setSelection).toHaveBeenCalledWith({
      activeCell: { rowIndex: 1, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 1, colIndex: 1 },
      selectedRange: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
    } satisfies GridSelection)
  })
})

describe('GridRuntime drag selection — 拖拽框选', () => {
  it('pointerdown 后 pointermove 用 anchor 扩展选区，pointerup 后停止扩展', () => {
    const engine = makeEngine()
    const host = makeHost()
    const renderer = makeRenderer()
    const runtime = new GridRuntime({ engine, host, renderer })

    runtime.handleHostPointerDown({ x: 20, y: 44, shiftKey: false })
    runtime.handleHostPointerMove({ x: 220, y: 100, shiftKey: false })
    runtime.handleHostPointerUp()
    runtime.handleHostPointerMove({ x: 20, y: 44, shiftKey: false })

    expect(engine.selectCell).toHaveBeenNthCalledWith(1, { rowIndex: 0, colIndex: 0 })
    expect(engine.selectCell).toHaveBeenNthCalledWith(
      2,
      { rowIndex: 2, colIndex: 2 },
      { extend: true },
    )
    expect(engine.selectCell).toHaveBeenCalledTimes(2)
  })

  it('pointerdown 未命中 body 时不会进入拖拽选择', () => {
    const engine = makeEngine()
    const host = makeHost()
    const renderer = makeRenderer()
    const runtime = new GridRuntime({ engine, host, renderer })

    runtime.handleHostPointerDown({ x: 20, y: 12, shiftKey: false })
    runtime.handleHostPointerMove({ x: 220, y: 100, shiftKey: false })

    expect(engine.selectCell).not.toHaveBeenCalled()
  })
})

describe('GridRuntime drag auto-scroll — 拖选带动滚动', () => {
  it('拖到视口右下热区时滚动 scrollHost，并继续扩展选区', () => {
    const engine = {
      ...makeEngine(),
      getRowsTotalSize: () => 800,
      getColsTotalSize: () => 800,
    } satisfies GridEngine
    let scrollTop = 0
    let scrollLeft = 0
    const host = {
      ...makeHost(),
      scrollTo: mock((top: number, left: number) => {
        scrollTop = top
        scrollLeft = left
      }),
      getScrollPosition: () => ({ scrollTop, scrollLeft }),
      getContainerSize: () => ({ width: 300, height: 300 }),
    } satisfies WebHost
    const renderer = makeRenderer()
    const runtime = new GridRuntime({ engine, host, renderer })

    const rafs: Array<FrameRequestCallback> = []
    const originalRaf = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      rafs.push(cb)
      return rafs.length
    }) as typeof requestAnimationFrame

    runtime.handleHostPointerDown({ x: 20, y: 44, shiftKey: false })
    runtime.handleHostPointerMove({ x: 292, y: 292, shiftKey: false })

    rafs[rafs.length - 1]!(performance.now())

    expect(host.scrollTo).toHaveBeenCalled()
    expect(scrollTop).toBeGreaterThan(0)
    expect(scrollLeft).toBeGreaterThan(0)
    expect(engine.selectCell).toHaveBeenLastCalledWith(
      { rowIndex: 9, colIndex: 2 },
      { extend: true },
    )

    globalThis.requestAnimationFrame = originalRaf
  })

  it('pointerup 后停止已经入队的 auto-scroll', () => {
    const engine = makeEngine()
    const host = makeHost()
    const renderer = makeRenderer()
    const runtime = new GridRuntime({ engine, host, renderer })

    const rafs: Array<FrameRequestCallback> = []
    const originalRaf = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      rafs.push(cb)
      return rafs.length
    }) as typeof requestAnimationFrame

    runtime.handleHostPointerDown({ x: 20, y: 44, shiftKey: false })
    runtime.handleHostPointerMove({ x: 392, y: 292, shiftKey: false })
    runtime.handleHostPointerUp()

    rafs[rafs.length - 1]!(performance.now())

    expect(host.scrollTo).not.toHaveBeenCalled()

    globalThis.requestAnimationFrame = originalRaf
  })
})

describe('GridRuntime keyboard navigation — Phase 3.3', () => {
  it('消费方向键后更新选区、滚动跟随并重绘', () => {
    const engine = makeEngine()
    engine.navigateSelection = mock(() => true)
    engine.getSelection = mock(() => ({
      activeCell: { rowIndex: 2, colIndex: 1 },
      anchorCell: { rowIndex: 2, colIndex: 1 },
      extentCell: { rowIndex: 2, colIndex: 1 },
      selectedRange: { startRow: 2, endRow: 2, startCol: 1, endCol: 1 },
    }))
    const rowsAxis = {
      indexToPosition: (i: number) => i * 28,
      getSize: () => 28,
    }
    const colsAxis = {
      indexToPosition: (i: number) => i * 100,
      getSize: () => 100,
    }
    engine.getFrame = mock(() => ({
      data: {} as DataSource,
      theme: { metrics: { headerHeight: 32 } } as Theme,
      rowsAxis: rowsAxis as never,
      colsAxis: colsAxis as never,
      viewport: {
        contentRect: { width: 400, height: 300 },
        rowHeaderWidth: 0,
        scrollX: 0,
        scrollY: 0,
      } as never,
      collapsedRowGaps: [],
      collapsedColGaps: [],
    }))

    const host = makeHost()
    const runtime = new GridRuntime({ engine, host, renderer: makeRenderer() })

    const handled = runtime.handleHostKeyDown({
      key: 'ArrowDown',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })

    expect(handled).toBe(true)
    expect(engine.navigateSelection).toHaveBeenCalledWith('ArrowDown', false)
  })

  it('未识别按键返回 false', () => {
    const engine = makeEngine()
    const runtime = new GridRuntime({ engine, host: makeHost(), renderer: makeRenderer() })

    expect(
      runtime.handleHostKeyDown({
        key: 'Escape',
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      }),
    ).toBe(false)
    expect(engine.navigateSelection).toHaveBeenCalledWith('Escape', false)
  })

  it('core.L2.grid-custom-editor-open-triggers routes typing through custom editor context', () => {
    const engine = makeEngine()
    engine.getSelection = mock(() => ({
      activeCell: { rowIndex: 1, colIndex: 0 },
      anchorCell: { rowIndex: 1, colIndex: 0 },
      extentCell: { rowIndex: 1, colIndex: 0 },
      selectedRange: { startRow: 1, endRow: 1, startCol: 0, endCol: 0 },
    }))
    engine.getFrame = mock(() =>
      makeFrameWithFields(
        [{ id: 'owner', name: 'Owner', type: 'assignee', width: 160 }],
        [{ owner: 'Ada' }, { owner: 'Alice' }],
      ),
    )
    const editor = { open: mock((_ctx: CellEditorOpenContext) => {}) }
    const runtime = new GridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      cellEditors: { assignee: editor },
    })

    expect(
      runtime.handleHostKeyDown({
        key: 'B',
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      }),
    ).toBe(true)

    expect(editor.open).toHaveBeenCalledTimes(1)
    expect(editor.open.mock.calls[0]?.[0]).toMatchObject({
      cell: { rowIndex: 1, colIndex: 0 },
      field: { id: 'owner', type: 'assignee' },
      value: 'Alice',
      rect: { x: 0, y: 60, width: 160, height: 28 },
      trigger: 'typing',
      initialInput: 'B',
    })
    expect(engine.beginCellEdit).not.toHaveBeenCalled()
    expect(engine.updateCellEditDraft).not.toHaveBeenCalled()
  })

  it('core.L2.grid-custom-editor-open-triggers routes double-click through custom editor context', () => {
    const engine = makeEngine()
    engine.getFrame = mock(() =>
      makeFrameWithFields(
        [{ id: 'owner', name: 'Owner', type: 'assignee', width: 160 }],
        [{ owner: 'Ada' }, { owner: 'Alice' }],
      ),
    )
    const editor = { open: mock((_ctx: CellEditorOpenContext) => {}) }
    const runtime = new GridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      cellEditors: { assignee: editor },
    })

    runtime.handleHostDoubleClick({ x: 8, y: 64, shiftKey: false })

    expect(editor.open).toHaveBeenCalledTimes(1)
    expect(editor.open.mock.calls[0]?.[0]).toMatchObject({
      cell: { rowIndex: 1, colIndex: 0 },
      trigger: 'double-click',
    })
    expect(engine.beginCellEdit).not.toHaveBeenCalled()
    expect(engine.updateCellEditDraft).not.toHaveBeenCalled()
  })

  it('core.L2.grid-custom-editor-open-triggers routes F2 through custom editor context', () => {
    const engine = makeEngine()
    engine.getSelection = mock(() => ({
      activeCell: { rowIndex: 1, colIndex: 0 },
      anchorCell: { rowIndex: 1, colIndex: 0 },
      extentCell: { rowIndex: 1, colIndex: 0 },
      selectedRange: { startRow: 1, endRow: 1, startCol: 0, endCol: 0 },
    }))
    engine.getFrame = mock(() =>
      makeFrameWithFields(
        [{ id: 'owner', name: 'Owner', type: 'assignee', width: 160 }],
        [{ owner: 'Ada' }, { owner: 'Alice' }],
      ),
    )
    const editor = { open: mock((_ctx: CellEditorOpenContext) => {}) }
    const runtime = new GridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      cellEditors: { assignee: editor },
    })

    expect(
      runtime.handleHostKeyDown({
        key: 'F2',
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      }),
    ).toBe(true)

    expect(editor.open).toHaveBeenCalledTimes(1)
    expect(editor.open.mock.calls[0]?.[0]).toMatchObject({
      cell: { rowIndex: 1, colIndex: 0 },
      trigger: 'f2',
    })
    expect(engine.beginCellEdit).not.toHaveBeenCalled()
    expect(engine.updateCellEditDraft).not.toHaveBeenCalled()
  })

  it('core.L2.grid-custom-editor-open-triggers routes Enter through custom editor context', () => {
    const engine = makeEngine()
    engine.getSelection = mock(() => ({
      activeCell: { rowIndex: 1, colIndex: 0 },
      anchorCell: { rowIndex: 1, colIndex: 0 },
      extentCell: { rowIndex: 1, colIndex: 0 },
      selectedRange: { startRow: 1, endRow: 1, startCol: 0, endCol: 0 },
    }))
    engine.getFrame = mock(() =>
      makeFrameWithFields(
        [{ id: 'owner', name: 'Owner', type: 'assignee', width: 160 }],
        [{ owner: 'Ada' }, { owner: 'Alice' }],
      ),
    )
    const editor = { open: mock((_ctx: CellEditorOpenContext) => {}) }
    const runtime = new GridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      cellEditors: { assignee: editor },
    })

    expect(
      runtime.handleHostKeyDown({
        key: 'Enter',
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      }),
    ).toBe(true)

    expect(editor.open).toHaveBeenCalledTimes(1)
    expect(editor.open.mock.calls[0]?.[0]).toMatchObject({
      cell: { rowIndex: 1, colIndex: 0 },
      trigger: 'enter',
    })
    expect(engine.beginCellEdit).not.toHaveBeenCalled()
    expect(engine.updateCellEditDraft).not.toHaveBeenCalled()
  })

  it('core.L2.grid-custom-editor-open-triggers routes API calls through custom editor context', () => {
    const engine = makeEngine()
    engine.getColumnIndex = mock((fieldId: string) => (fieldId === 'owner' ? 0 : -1))
    engine.getFrame = mock(() =>
      makeFrameWithFields([{ id: 'owner', name: 'Owner', type: 'assignee', width: 160 }]),
    )
    const editor = { open: mock((_ctx: CellEditorOpenContext) => {}) }
    const runtime = new GridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      cellEditors: { assignee: editor },
    })

    expect(runtime.openCellEditor(0, 'owner')).toBe(true)

    expect(editor.open).toHaveBeenCalledTimes(1)
    expect(editor.open.mock.calls[0]?.[0]).toMatchObject({
      cell: { rowIndex: 0, colIndex: 0 },
      field: { id: 'owner', type: 'assignee' },
      value: 'Alice',
      rect: { x: 0, y: 32, width: 160, height: 28 },
      trigger: 'api',
    })
    expect(engine.beginCellEdit).not.toHaveBeenCalled()
    expect(engine.updateCellEditDraft).not.toHaveBeenCalled()
  })

  it('custom editor commit delegates to engine commitCellValue instead of paste', () => {
    const engine = makeEngine()
    engine.getFrame = mock(() =>
      makeFrameWithFields([{ id: 'owner', name: 'Owner', type: 'assignee', width: 160 }]),
    )
    engine.commitCellValue = mock(() => true)
    const editor = {
      open: mock((ctx: CellEditorOpenContext) => ctx.commit('Bob')),
      close: mock(() => {}),
    }
    const runtime = new GridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      cellEditors: { assignee: editor },
    })

    expect(runtime.openCellEditor(0, 'owner')).toBe(true)

    expect(engine.commitCellValue).toHaveBeenCalledWith(
      { rowIndex: 0, colIndex: 0 },
      'owner',
      'Bob',
    )
    expect(engine.commitPaste).not.toHaveBeenCalled()
    expect(editor.close).toHaveBeenCalledTimes(1)
  })

  it('merged non-anchor custom editor commit writes anchor field only', () => {
    const engine = makeEngine()
    engine.getColumnIndex = mock((fieldId: string) =>
      fieldId === 'owner' ? 0 : fieldId === 'role' ? 1 : -1,
    )
    engine.getFrame = mock(() => ({
      ...makeFrameWithFields(
        [
          { id: 'owner', name: 'Owner', type: 'assignee', width: 160 },
          { id: 'role', name: 'Role', type: 'assignee', width: 160 },
        ],
        [{ owner: 'Ada', role: 'Designer' }],
      ),
      mergeRegions: [
        {
          id: 'merge-1',
          range: { startRow: 0, endRow: 0, startCol: 0, endCol: 1 },
          anchor: { rowIndex: 0, colIndex: 0 },
        },
      ],
    }))
    engine.commitCellValue = mock(() => true)
    const editor = {
      open: mock((ctx: CellEditorOpenContext) => ctx.commit('Bob')),
      close: mock(() => {}),
    }
    const runtime = new GridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      cellEditors: { assignee: editor },
    })

    expect(runtime.openCellEditor(0, 'role')).toBe(true)

    expect(editor.open.mock.calls[0]?.[0]).toMatchObject({
      cell: { rowIndex: 0, colIndex: 0 },
      field: { id: 'owner', type: 'assignee' },
      value: 'Ada',
      rect: { x: 0, y: 32, width: 320, height: 28 },
    })
    expect(engine.commitCellValue).toHaveBeenCalledWith(
      { rowIndex: 0, colIndex: 0 },
      'owner',
      'Bob',
    )
    expect(engine.commitCellValue).not.toHaveBeenCalledWith(
      { rowIndex: 0, colIndex: 1 },
      'role',
      'Bob',
    )
  })

  it('custom editor lifecycle closes active editor on reopen, pointerdown, scroll, and destroy', () => {
    const engine = makeEngine()
    engine.getColumnIndex = mock((fieldId: string) =>
      fieldId === 'owner' ? 0 : fieldId === 'reviewer' ? 1 : -1,
    )
    engine.getFrame = mock(() =>
      makeFrameWithFields(
        [
          { id: 'owner', name: 'Owner', type: 'assignee', width: 160 },
          { id: 'reviewer', name: 'Reviewer', type: 'assignee', width: 160 },
        ],
        [{ owner: 'Ada', reviewer: 'Grace' }],
      ),
    )
    const close = mock(() => {})
    const destroy = mock(() => {})
    const editor = { open: mock((_ctx: CellEditorOpenContext) => {}), close, destroy }
    const runtime = new GridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      cellEditors: { assignee: editor },
    })

    expect(runtime.openCellEditor(0, 'owner')).toBe(true)
    expect(runtime.openCellEditor(0, 'reviewer')).toBe(true)
    expect(close).toHaveBeenCalledTimes(1)

    runtime.handleHostPointerDown({ x: 8, y: 36, button: 0, shiftKey: false })
    expect(close).toHaveBeenCalledTimes(2)

    expect(runtime.openCellEditor(0, 'owner')).toBe(true)
    runtime.handleHostScroll(12, 0)
    expect(close).toHaveBeenCalledTimes(3)

    expect(runtime.openCellEditor(0, 'owner')).toBe(true)
    runtime.destroy()
    expect(close).toHaveBeenCalledTimes(4)
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('custom editor lifecycle ignores stale commit and cancel after reopen', () => {
    const engine = makeEngine()
    engine.getColumnIndex = mock((fieldId: string) =>
      fieldId === 'owner' ? 0 : fieldId === 'reviewer' ? 1 : -1,
    )
    engine.getFrame = mock(() =>
      makeFrameWithFields(
        [
          { id: 'owner', name: 'Owner', type: 'assignee', width: 160 },
          { id: 'reviewer', name: 'Reviewer', type: 'assignee', width: 160 },
        ],
        [{ owner: 'Ada', reviewer: 'Grace' }],
      ),
    )
    engine.commitCellValue = mock(() => true)
    const contexts: CellEditorOpenContext[] = []
    const editor = {
      open: mock((ctx: CellEditorOpenContext) => contexts.push(ctx)),
      close: mock(() => {}),
    }
    const runtime = new GridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      cellEditors: { assignee: editor },
    })

    expect(runtime.openCellEditor(0, 'owner')).toBe(true)
    const staleCtx = contexts[0]!
    expect(runtime.openCellEditor(0, 'reviewer')).toBe(true)
    const currentCtx = contexts[1]!

    staleCtx.commit('Stale owner')
    staleCtx.cancel()

    expect(engine.commitCellValue).not.toHaveBeenCalled()
    expect(editor.close).toHaveBeenCalledTimes(1)

    currentCtx.commit('Current reviewer')

    expect(engine.commitCellValue).toHaveBeenCalledTimes(1)
    expect(engine.commitCellValue).toHaveBeenCalledWith(
      { rowIndex: 0, colIndex: 1 },
      'reviewer',
      'Current reviewer',
    )
    expect(editor.close).toHaveBeenCalledTimes(2)
  })

  it('选中后直接键入进入编辑（Sheets 式）', () => {
    const engine = makeEngine()
    engine.getSelection = mock(() => ({
      activeCell: { rowIndex: 1, colIndex: 0 },
      anchorCell: { rowIndex: 1, colIndex: 0 },
      extentCell: { rowIndex: 1, colIndex: 0 },
      selectedRange: { startRow: 1, endRow: 1, startCol: 0, endCol: 0 },
    }))
    engine.beginCellEdit = mock(() => true)
    engine.updateCellEditDraft = mock(() => {})
    engine.getFrame = mock(() => ({
      data: {} as never,
      theme: { metrics: { headerHeight: 32 } } as never,
      rowsAxis: { indexToPosition: () => 0, getSize: () => 28 } as never,
      colsAxis: { indexToPosition: () => 0, getSize: () => 100 } as never,
      viewport: {
        regions: [
          {
            id: 'main',
            rowBand: 'middle',
            rowRange: [0, 9],
            colRange: [0, 2],
            rect: { x: 0, y: 32, width: 300, height: 200 },
            scrollOffsetX: 0,
            scrollOffsetY: 0,
            zIndex: 10,
          },
        ],
      } as never,
      cellEdit: {
        cell: { rowIndex: 1, colIndex: 0 },
        fieldId: 'name',
        fieldType: 'text' as const,
        draft: 'x',
      },
      collapsedRowGaps: [],
      collapsedColGaps: [],
    }))

    const renderer = makeRenderer()
    const editor = {
      open: mock(() => {
        expect(renderer.render).toHaveBeenCalled()
      }),
      close: mock(() => {}),
      isOpen: mock(() => false),
      syncRect: mock(() => {}),
      applyTheme: mock(() => {}),
    }
    const runtime = new GridRuntime({ engine, host: makeHost(), renderer })
    runtime.setCellEditor(editor as never)

    const keyEvent = {
      key: 'x',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    }
    expect(runtime.handleHostKeyDown(keyEvent)).toBe(true)
    expect(engine.beginCellEdit).toHaveBeenCalledWith({ rowIndex: 1, colIndex: 0 })
    expect(engine.updateCellEditDraft).toHaveBeenCalledWith('x')
    expect(engine.navigateSelection).not.toHaveBeenCalled()
  })

  it('合并单元格进入编辑时，编辑器覆盖完整合并区域', () => {
    const engine = makeEngine()
    engine.getSelection = mock(() => ({
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 1, colIndex: 1 },
      selectedRange: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
    }))
    engine.beginCellEdit = mock(() => true)
    engine.getFrame = mock(() => ({
      data: {
        getSchema: () => ({
          fields: [
            { id: 'name', name: 'Name', type: 'text', width: 100 },
            { id: 'role', name: 'Role', type: 'text', width: 100 },
          ],
        }),
      } as never,
      theme: { metrics: { headerHeight: 32 } } as never,
      rowsAxis: { indexToPosition: (i: number) => i * 28, getSize: () => 28 } as never,
      colsAxis: { indexToPosition: (i: number) => i * 100, getSize: () => 100 } as never,
      viewport: {
        regions: [
          {
            id: 'main',
            rowBand: 'middle',
            colBand: 'center',
            rowRange: [0, 1],
            colRange: [0, 1],
            rect: { x: 0, y: 32, width: 200, height: 200 },
            scrollOffsetX: 0,
            scrollOffsetY: 0,
            zIndex: 10,
          },
        ],
      } as never,
      cellEdit: {
        cell: { rowIndex: 0, colIndex: 0 },
        fieldId: 'name',
        fieldType: 'text' as const,
        draft: 'Alice',
      },
      mergeRegions: [
        {
          id: 'merge-1',
          range: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
          anchor: { rowIndex: 0, colIndex: 0 },
        },
      ],
      collapsedRowGaps: [],
      collapsedColGaps: [],
    }))

    const editor = {
      open: mock(() => {}),
      close: mock(() => {}),
      isOpen: mock(() => false),
      syncRect: mock(() => {}),
      applyTheme: mock(() => {}),
    }
    const runtime = new GridRuntime({ engine, host: makeHost(), renderer: makeRenderer() })
    runtime.setCellEditor(editor as never)

    expect(runtime.handleHostKeyDown({ key: 'x', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false })).toBe(
      true,
    )

    // 文本格（含合并）一律多行编辑器以支持 Alt+Enter；合并格只是不参与 autofit。
    expect(editor.open).toHaveBeenCalledWith(
      { x: 0, y: 32, width: 200, height: 56 },
      'Alice',
      { selectAll: false, multiline: true },
    )
  })

  it('Enter 恢复为下移导航', () => {
    const engine = makeEngine()
    engine.navigateSelection = mock(() => true)
    engine.getSelection = mock(() => ({
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 0, colIndex: 0 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
    }))
    engine.getFrame = mock(() => ({
      data: {} as never,
      theme: { metrics: { headerHeight: 32 } } as never,
      rowsAxis: {
        indexToPosition: (i: number) => i * 28,
        getSize: () => 28,
      } as never,
      colsAxis: {
        indexToPosition: (i: number) => i * 100,
        getSize: () => 100,
      } as never,
      viewport: {
        contentRect: { width: 400, height: 300 },
        rowHeaderWidth: 0,
        scrollX: 0,
        scrollY: 0,
      } as never,
      collapsedRowGaps: [],
      collapsedColGaps: [],
    }))
    const runtime = new GridRuntime({ engine, host: makeHost(), renderer: makeRenderer() })

    expect(
      runtime.handleHostKeyDown({
        key: 'Enter',
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      }),
    ).toBe(true)
    expect(engine.navigateSelection).toHaveBeenCalledWith('Enter', false)
    expect(engine.beginCellEdit).not.toHaveBeenCalled()
  })
})

describe('GridRuntime contextmenu — Phase 4.0', () => {
  function makeContextMenu() {
    return {
      open: mock((_options: unknown) => {}),
      close: mock(() => {}),
      isOpen: mock(() => false),
      applyTheme: mock(() => {}),
      destroy: mock(() => {}),
      attach: mock(() => {}),
    }
  }

  function makeFilterPopover() {
    return {
      open: mock((_anchor: unknown, _options: unknown) => {}),
      close: mock(() => {}),
      isOpen: mock(() => false),
      applyTheme: mock(() => {}),
      destroy: mock(() => {}),
      attach: mock(() => {}),
    }
  }

  const headerSchema: Schema = {
    fields: [
      { id: 'name', name: 'Name', type: 'text', width: 100 },
      { id: 'score', name: 'Score', type: 'number', width: 100 },
    ],
  }

  function makeHeaderRuntime(options: { rowHeaderWidth?: number; columnWidth?: number } = {}) {
    const rowHeaderWidth = options.rowHeaderWidth ?? 0
    const columnWidth = options.columnWidth ?? 100
    const source = new InMemoryDataSource({
      rows: [
        { name: 'Ada', score: 2 },
        { name: 'Grace', score: 1 },
      ],
      schema: headerSchema,
    })
    const filterLayer = new FilterLayer()
    const sortLayer = new SortLayer()
    const pipeline = new ViewPipeline(source)
    pipeline.add(filterLayer)
    pipeline.add(sortLayer)

    const engine = makeEngine()
    engine.getData = mock(() => pipeline.getComposed() as never)
    engine.getFrame = mock(() => ({
      data: pipeline.getComposed(),
      theme: { metrics: { headerHeight: 32 } } as Theme,
      rowsAxis: {
        getCount: () => 2,
        positionToIndex: (pos: number) => Math.floor(pos / 28),
        indexToPosition: (i: number) => i * 28,
        getSize: () => 28,
      } as never,
      colsAxis: {
        getCount: () => headerSchema.fields.length,
        getTotalSize: () => headerSchema.fields.length * columnWidth,
        positionToIndex: (pos: number) =>
          Math.max(0, Math.min(headerSchema.fields.length - 1, Math.floor(pos / columnWidth))),
        indexToPosition: (i: number) => i * columnWidth,
        getSize: () => columnWidth,
      } as never,
      viewport: {
        contentRect: { width: 400, height: 300 },
        rowHeaderWidth,
        scrollX: 0,
        scrollY: 0,
        regions: [
          {
            id: 'main',
            rowBand: 'middle',
            colBand: 'center',
            rowRange: [0, 1],
            colRange: [0, 1],
            rect: { x: 0, y: 32, width: 200, height: 268 },
            scrollOffsetX: 0,
            scrollOffsetY: 0,
            zIndex: 10,
          },
        ],
      } as never,
      collapsedRowGaps: [],
      collapsedColGaps: [],
    }))
    const runtime = new GridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      viewPipeline: pipeline,
      sortLayer,
      filterLayer,
    })
    const menu = makeContextMenu()
    runtime.setContextMenuLayer(menu as never)
    return { engine, runtime, menu, sortLayer, filterLayer }
  }

  it('drag-select 进行中不开菜单', () => {
    const engine = makeEngine()
    const runtime = new GridRuntime({ engine, host: makeHost(), renderer: makeRenderer() })
    const menu = makeContextMenu()
    runtime.setContextMenuLayer(menu as never)
    runtime.handleHostPointerDown({ x: 50, y: 60, shiftKey: false, button: 0 })
    runtime.handleHostPointerMove({ x: 120, y: 120, shiftKey: false, button: 0 })
    runtime.handleHostContextMenu({ x: 100, y: 100, shiftKey: false, clientX: 100, clientY: 100 })
    expect(menu.open).not.toHaveBeenCalled()
  })

  it('右键 pointerdown（button=2）不进入 drag-select 模式', () => {
    const engine = makeEngine()
    engine.getFrame = mock(() => ({
      data: {} as never,
      theme: { metrics: { headerHeight: 32 } } as never,
      rowsAxis: {
        indexToPosition: () => 0,
        getSize: () => 28,
        positionToIndex: (p: number) => Math.floor(p / 28),
      } as never,
      colsAxis: {
        indexToPosition: () => 0,
        getSize: () => 100,
        positionToIndex: (p: number) => Math.floor(p / 100),
      } as never,
      viewport: {
        regions: [
          {
            id: 'main',
            rowBand: 'middle',
            rowRange: [0, 9],
            colRange: [0, 2],
            rect: { x: 0, y: 32, width: 300, height: 200 },
            scrollOffsetX: 0,
            scrollOffsetY: 0,
            zIndex: 10,
          },
        ],
      } as never,
      collapsedRowGaps: [],
      collapsedColGaps: [],
    }))
    const runtime = new GridRuntime({ engine, host: makeHost(), renderer: makeRenderer() })
    runtime.handleHostPointerDown({ x: 50, y: 60, shiftKey: false, button: 2 })
    expect(engine.selectCell).not.toHaveBeenCalled()
  })

  it('cell 编辑中先 commit 再开菜单', () => {
    const engine = makeEngine()
    engine.isCellEditing = mock(() => true)
    engine.commitCellEdit = mock(() => true)
    engine.getFrame = mock(() => ({
      data: {} as never,
      theme: { metrics: { headerHeight: 32 } } as never,
      rowsAxis: {
        indexToPosition: () => 0,
        getSize: () => 28,
        positionToIndex: (pos: number) => Math.floor(pos / 28),
      } as never,
      colsAxis: {
        indexToPosition: () => 0,
        getSize: () => 100,
        positionToIndex: (pos: number) => Math.floor(pos / 100),
      } as never,
      viewport: {
        regions: [
          {
            id: 'main',
            rowBand: 'middle',
            rowRange: [0, 9],
            colRange: [0, 2],
            rect: { x: 0, y: 32, width: 300, height: 200 },
            scrollOffsetX: 0,
            scrollOffsetY: 0,
            zIndex: 10,
          },
        ],
      } as never,
      collapsedRowGaps: [],
      collapsedColGaps: [],
    }))
    const runtime = new GridRuntime({ engine, host: makeHost(), renderer: makeRenderer() })
    const editor = {
      open: mock(() => {}),
      close: mock(() => {}),
      isOpen: mock(() => true),
      applyTheme: mock(() => {}),
      destroy: mock(() => {}),
    }
    runtime.setCellEditor(editor as never)
    const menu = makeContextMenu()
    runtime.setContextMenuLayer(menu as never)
    runtime.handleHostContextMenu({ x: 50, y: 60, shiftKey: false, clientX: 50, clientY: 60 })
    expect(engine.commitCellEdit).toHaveBeenCalled()
    expect(menu.open).toHaveBeenCalled()
  })

  it('right-click within header opens column header menu', () => {
    const { runtime, menu } = makeHeaderRuntime()

    runtime.handleHostContextMenu({ x: 150, y: 10, shiftKey: false, clientX: 150, clientY: 10 })

    expect(menu.open).toHaveBeenCalledTimes(1)
    const options = menu.open.mock.calls[0]![0] as { items: readonly { id: string }[] }
    expect(options.items.slice(0, 5).map((item) => item.id)).toEqual([
      'filter-open',
      'filter-clear',
      'sort-asc',
      'sort-desc',
      'sort-none',
    ])
  })

  it('keeps sort actions enabled for sortable columns when selection spans columns', () => {
    const { engine, runtime, menu } = makeHeaderRuntime()
    engine.getSelection = mock(() => ({
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 0, colIndex: 1 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 1 },
    }))

    runtime.handleHostContextMenu({ x: 150, y: 10, shiftKey: false, clientX: 150, clientY: 10 })

    const options = menu.open.mock.calls[0]![0] as {
      items: readonly { id: string; disabled: boolean }[]
    }
    expect(options.items.find((item) => item.id === 'sort-asc')!.disabled).toBe(false)
    expect(options.items.find((item) => item.id === 'sort-desc')!.disabled).toBe(false)
  })

  it('right-click in row-header gutter does not open column header menu', () => {
    const { runtime, menu } = makeHeaderRuntime({ rowHeaderWidth: 48 })

    runtime.handleHostContextMenu({ x: 24, y: 10, shiftKey: false, clientX: 24, clientY: 10 })

    expect(menu.open).not.toHaveBeenCalled()
  })

  it('right-click in blank header space right of columns does not open menu', () => {
    const { runtime, menu } = makeHeaderRuntime({ rowHeaderWidth: 48, columnWidth: 100 })

    runtime.handleHostContextMenu({ x: 260, y: 10, shiftKey: false, clientX: 260, clientY: 10 })

    expect(menu.open).not.toHaveBeenCalled()
  })

  it('right-click in body still opens cell menu', () => {
    const { runtime, menu } = makeHeaderRuntime()

    runtime.handleHostContextMenu({ x: 50, y: 60, shiftKey: false, clientX: 50, clientY: 60 })

    expect(menu.open).toHaveBeenCalledTimes(1)
    const options = menu.open.mock.calls[0]![0] as { items: readonly { id: string }[] }
    expect(options.items.map((item) => item.id)).toEqual(['cut', 'copy', 'paste'])
  })

  it('column header menu actions update sort and filter layers', () => {
    const { runtime, sortLayer, filterLayer } = makeHeaderRuntime()
    filterLayer.setSpec({ fieldId: 'score', op: { kind: 'number-equals', value: 2 } })

    runtime.handleHostContextMenu({ x: 150, y: 10, shiftKey: false, clientX: 150, clientY: 10 })
    runtime.handleContextMenuSelected('sort-asc')
    expect(sortLayer.getSpec()).toEqual({ fieldId: 'score', direction: 'asc' })

    runtime.handleContextMenuSelected('sort-desc')
    expect(sortLayer.getSpec()).toEqual({ fieldId: 'score', direction: 'desc' })

    runtime.handleContextMenuSelected('sort-none')
    expect(sortLayer.getSpec()).toBeNull()

    expect(filterLayer.getSpec()).not.toBeNull()
    runtime.handleContextMenuSelected('filter-clear')
    expect(filterLayer.getSpec()).toBeNull()
  })

  it('filter-open closes context menu and opens filter popover for the header field', () => {
    const { runtime, menu, filterLayer } = makeHeaderRuntime()
    const popover = makeFilterPopover()
    runtime.setFilterPopover(popover as never)
    filterLayer.setSpec({ fieldId: 'score', op: { kind: 'number-between', min: 1, max: null } })

    runtime.handleHostContextMenu({ x: 150, y: 10, shiftKey: false, clientX: 160, clientY: 20 })
    runtime.handleContextMenuSelected('filter-open')

    expect(menu.close).toHaveBeenCalled()
    expect(popover.open).toHaveBeenCalledWith(
      { clientX: 160, clientY: 20 },
      {
        field: headerSchema.fields[1],
        op: { kind: 'number-between', min: 1, max: null },
      },
    )
  })

  it('filter popover Apply updates and clears the active field filter', () => {
    const { runtime, filterLayer } = makeHeaderRuntime()
    runtime.setFilterPopover(makeFilterPopover() as never)

    runtime.handleHostContextMenu({ x: 150, y: 10, shiftKey: false, clientX: 160, clientY: 20 })
    runtime.handleContextMenuSelected('filter-open')
    runtime.handleFilterPopoverApply({ kind: 'number-between', min: 1, max: 3 })
    expect(filterLayer.getSpec()).toEqual({
      fieldId: 'score',
      op: { kind: 'number-between', min: 1, max: 3 },
    })

    runtime.handleHostContextMenu({ x: 150, y: 10, shiftKey: false, clientX: 160, clientY: 20 })
    runtime.handleContextMenuSelected('filter-open')
    runtime.handleFilterPopoverApply(null)
    expect(filterLayer.getSpec()).toBeNull()
  })

  it('filter popover open gates grid keyboard handling', () => {
    const { runtime, engine } = makeHeaderRuntime()
    const popover = makeFilterPopover()
    popover.isOpen = mock(() => true)
    runtime.setFilterPopover(popover as never)

    expect(
      runtime.handleHostKeyDown({
        key: 'ArrowDown',
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      }),
    ).toBe(false)
    expect(engine.navigateSelection).not.toHaveBeenCalled()
  })

  it('range 外右键调 selectCell；range 内不动 selection', () => {
    const engine = makeEngine()
    const selectCell = mock(() => {})
    engine.selectCell = selectCell
    engine.getSelection = mock(() => ({
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 0, colIndex: 0 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
    }))
    engine.getFrame = mock(() => ({
      data: {} as never,
      theme: { metrics: { headerHeight: 32 } } as never,
      rowsAxis: {
        indexToPosition: () => 0,
        getSize: () => 28,
        positionToIndex: (pos: number) => Math.floor(pos / 28),
      } as never,
      colsAxis: {
        indexToPosition: () => 0,
        getSize: () => 100,
        positionToIndex: (pos: number) => Math.floor(pos / 100),
      } as never,
      viewport: {
        regions: [
          {
            id: 'main',
            rowBand: 'middle',
            rowRange: [0, 9],
            colRange: [0, 2],
            rect: { x: 0, y: 32, width: 300, height: 200 },
            scrollOffsetX: 0,
            scrollOffsetY: 0,
            zIndex: 10,
          },
        ],
      } as never,
      collapsedRowGaps: [],
      collapsedColGaps: [],
    }))
    const runtime = new GridRuntime({ engine, host: makeHost(), renderer: makeRenderer() })
    runtime.setContextMenuLayer(makeContextMenu() as never)

    // 命中 (rowIndex=2, colIndex=1) — 在 range (0,0,0,0) 外
    runtime.handleHostContextMenu({ x: 150, y: 100, shiftKey: false, clientX: 150, clientY: 100 })
    expect(selectCell).toHaveBeenCalledWith({ rowIndex: 2, colIndex: 1 })

    selectCell.mockClear()
    // 命中 (0, 0) — 在 range 内
    runtime.handleHostContextMenu({ x: 50, y: 40, shiftKey: false, clientX: 50, clientY: 40 })
    expect(selectCell).not.toHaveBeenCalled()
  })

  it('setData / scroll 自动关闭菜单（via afterEngineMutation）', () => {
    const engine = makeEngine()
    const runtime = new GridRuntime({ engine, host: makeHost(), renderer: makeRenderer() })
    const menu = makeContextMenu()
    menu.isOpen = mock(() => true)
    runtime.setContextMenuLayer(menu as never)

    runtime.setData({} as never, () => makeRenderer())
    expect(menu.close).toHaveBeenCalled()

    menu.close.mockClear()
    runtime.handleHostScroll(100, 0)
    expect(menu.close).toHaveBeenCalled()
  })
})

describe('GridRuntime column resize — Phase 3.4', () => {
  const columnHandle: ResizeHandleRect = {
    kind: 'column',
    id: 'name',
    fieldId: 'name',
    colIndex: 0,
    x: 92,
    y: 0,
    width: 8,
    height: 32,
  }

  it('拖拽中只更新预览，松手才 commitColumnResize', () => {
    const engine = makeEngine()
    engine.getColumnIndex = () => 0
    engine.getColsAxis = () =>
      ({
        getSize: () => 100,
      }) as never

    const showIndicator = mock(() => {})
    const hideIndicator = mock(() => {})
    const runtime = new GridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      handleLayer: { showIndicator, hideIndicator, sync: mock(() => {}) } as never,
    })

    runtime.handleResizePointerDown(columnHandle, 1, 100, 0)
    expect(engine.commitColumnResize).not.toHaveBeenCalled()
    expect(showIndicator).toHaveBeenCalled()

    runtime.handleResizePointerMove(1, 130, 0)
    expect(engine.commitColumnResize).not.toHaveBeenCalled()
    expect(showIndicator).toHaveBeenCalledTimes(2)

    runtime.handleResizePointerUp(1)
    expect(engine.commitColumnResize).toHaveBeenCalledTimes(1)
    expect(engine.commitColumnResize).toHaveBeenCalledWith(0, 100, 130)
    expect(hideIndicator).toHaveBeenCalled()
  })

  it('无位移松手不提交', () => {
    const engine = makeEngine()
    engine.getColumnIndex = () => 0
    engine.getColsAxis = () =>
      ({
        getSize: () => 100,
      }) as never

    const runtime = new GridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      handleLayer: {
        showIndicator: mock(() => {}),
        hideIndicator: mock(() => {}),
      } as never,
    })

    runtime.handleResizePointerDown(columnHandle, 1, 100, 0)
    runtime.handleResizePointerUp(1)

    expect(engine.commitColumnResize).not.toHaveBeenCalled()
  })

  it('attach 时 resize handle 主题使用 viewport rowHeaderWidth', () => {
    const applyTheme = mock(() => {})
    const engine = makeEngine()
    engine.getTheme = mock(
      () =>
        ({
          metrics: { headerHeight: 32, rowHeaderWidth: 0 },
          colors: { headerText: '#656d76', gridLineStrong: '#d0d7de', selectionBorder: '#0969da' },
        }) as Theme,
    )
    engine.getFrame = mock(() => ({
      data: {} as DataSource,
      theme: { metrics: { headerHeight: 32 } } as Theme,
      rowsAxis: { getCount: () => 10 } as never,
      colsAxis: {} as never,
      viewport: {
        contentRect: { width: 400, height: 300 },
        rowHeaderWidth: 44,
        regions: [],
      } as never,
      collapsedRowGaps: [],
      collapsedColGaps: [],
    }))

    const runtime = new GridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      handleLayer: {
        applyTheme,
        sync: mock(() => {}),
        showIndicator: mock(() => {}),
        hideIndicator: mock(() => {}),
      } as never,
    })

    runtime.attach()

    expect(applyTheme).toHaveBeenCalledWith(expect.anything(), {
      headerHeight: 32,
      rowHeaderWidth: 44,
    })
  })
})

describe('GridRuntime clipboard — Phase 4.1', () => {
  function makeAdapter(readReturn = '') {
    return {
      writeText: mock(async (_: string) => true),
      readText: mock(async () => readReturn),
    }
  }

  function makeMutableData(rows: Row[], schema: Schema) {
    const updateCell = mock((rowIndex: number, fieldId: string, value: unknown) => {
      const row = rows[rowIndex]
      if (row) (row as Record<string, unknown>)[fieldId] = value
    })
    return {
      getRowCount: () => rows.length,
      getSchema: () => schema,
      getRows: () => rows,
      getCell: (r: number, f: string) =>
        (rows[r] as Record<string, unknown> | undefined)?.[f] ?? null,
      subscribe: () => () => {},
      updateCell,
    }
  }

  const schema: Schema = {
    fields: [
      { id: 'a', name: 'A', type: 'text', width: 100 },
      { id: 'b', name: 'B', type: 'number', width: 100 },
    ],
  }

  function setupForCopyCut(
    activeCell = { rowIndex: 0, colIndex: 0 },
    range = {
      startRow: 0,
      endRow: 0,
      startCol: 0,
      endCol: 1,
    },
  ) {
    const engine = makeEngine()
    const rows = [{ a: 'hello', b: 42 }] as Row[]
    const data = makeMutableData(rows, schema)
    engine.getData = mock(() => data as never)
    engine.getSelection = mock(() => ({
      activeCell,
      anchorCell: activeCell,
      extentCell: activeCell,
      selectedRange: range,
    }))
    engine.clearRange = mock(() => {})
    const adapter = makeAdapter()
    const runtime = new GridRuntime({ engine, host: makeHost(), renderer: makeRenderer() })
    runtime.setClipboardAdapter(adapter as never)
    return { engine, runtime, adapter, data, rows }
  }

  it('copy 写 TSV 到 adapter', async () => {
    const { runtime, adapter } = setupForCopyCut()
    expect(await runtime.handleClipboardCopy()).toBe(true)
    expect(adapter.writeText).toHaveBeenCalledWith('hello\t42')
  })

  it('cut 写 TSV + 立即调 engine.clearRange', async () => {
    const { engine, runtime, adapter } = setupForCopyCut()
    expect(await runtime.handleClipboardCut()).toBe(true)
    expect(adapter.writeText).toHaveBeenCalledWith('hello\t42')
    expect(engine.clearRange).toHaveBeenCalledWith({
      startRow: 0,
      endRow: 0,
      startCol: 0,
      endCol: 1,
    })
  })

  it('paste readText 返回 null（adapter 不可用）→ no-op', async () => {
    const { runtime, data } = setupForCopyCut()
    ;(
      runtime as unknown as { clipboardAdapter: { readText: () => Promise<null> } }
    ).clipboardAdapter = {
      writeText: async () => true,
      readText: async () => null,
    } as never
    expect(await runtime.handleClipboardPaste()).toBe(false)
    expect(data.updateCell).not.toHaveBeenCalled()
  })

  it('paste 内部缓存命中走 typed 路径（保留类型）', async () => {
    const { engine, runtime, adapter } = setupForCopyCut()
    await runtime.handleClipboardCopy()
    // adapter.readText 返回 copy 时写入的同样 TSV → 内部缓存 hash 命中
    adapter.readText = mock(async () => 'hello\t42')
    expect(await runtime.handleClipboardPaste()).toBe(true)
    // typed 路径：engine.commitPaste 收到 typed:true 的 source，number 字段值保留为 42
    const calls = (engine.commitPaste as ReturnType<typeof mock>).mock.calls
    expect(calls.length).toBe(1)
    const source = calls[0]?.[0] as { typed: boolean; cells: unknown[][] }
    expect(source.typed).toBe(true)
    const bVal = source.cells[0]?.[1]
    expect(bVal).toBe(42)
  })

  it('paste 外部 TSV（hash 不匹配）走 parse + coerce 路径', async () => {
    const { engine, runtime, adapter } = setupForCopyCut()
    // 没 copy 过，clipboardCache 为 null；外部 TSV
    adapter.readText = mock(async () => 'external\t99')
    expect(await runtime.handleClipboardPaste()).toBe(true)
    // 外部 TSV 走 parse+coerce 路径：engine.commitPaste 收到正确的 source cells
    const calls = (engine.commitPaste as ReturnType<typeof mock>).mock.calls
    expect(calls.length).toBe(1)
    const source = calls[0]?.[0] as { typed: boolean; cells: unknown[][] }
    expect(source.typed).toBe(false)
    expect(source.cells[0]).toEqual(['external', 99])
  })

  it('paste 类型不匹配触发 onPasteSkipped', async () => {
    const { engine, runtime, adapter } = setupForCopyCut()
    const skipped = mock(
      (_: readonly { rowIndex: number; fieldId: string; reason: string }[]) => {},
    )
    runtime.setOnPasteSkipped(skipped as never)
    // 让 commitPaste mock 调用传入的 onSkipped 回调（模拟引擎行为）
    ;(engine.commitPaste as ReturnType<typeof mock>).mockImplementation(
      (
        _src: unknown,
        _tgt: unknown,
        _fids: unknown,
        onSkippedCb?: (
          cells: readonly { rowIndex: number; fieldId: string; reason: string }[],
        ) => void,
      ) => {
        onSkippedCb?.([{ rowIndex: 0, fieldId: 'b', reason: 'type' }])
      },
    )
    adapter.readText = mock(async () => 'ok\tabc') // 'abc' → number 列 → skip
    await runtime.handleClipboardPaste()
    expect(skipped).toHaveBeenCalledWith([{ rowIndex: 0, fieldId: 'b', reason: 'type' }])
  })

  it('non-Mutable DataSource：cut/paste no-op；copy 仍允许', async () => {
    const engine = makeEngine()
    engine.getData = mock(
      () =>
        ({
          getRowCount: () => 1,
          getSchema: () => schema,
          getRows: () => [],
          getCell: () => 'x',
          subscribe: () => () => {},
        }) as never,
    )
    engine.getSelection = mock(() => ({
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 0, colIndex: 0 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
    }))
    const adapter = makeAdapter()
    const runtime = new GridRuntime({ engine, host: makeHost(), renderer: makeRenderer() })
    runtime.setClipboardAdapter(adapter as never)

    expect(await runtime.handleClipboardCut()).toBe(false)
    expect(await runtime.handleClipboardPaste()).toBe(false)
    expect(await runtime.handleClipboardCopy()).toBe(true) // copy 不要求 mutable
  })
})

describe('GridRuntime keyboard clipboard — Phase 4.1', () => {
  function setup() {
    const engine = makeEngine()
    const rows = [{ a: 'x', b: 1 }] as Row[]
    const schema: Schema = {
      fields: [
        { id: 'a', name: 'A', type: 'text', width: 100 },
        { id: 'b', name: 'B', type: 'number', width: 100 },
      ],
    }
    const updateCell = mock(() => {})
    engine.getData = mock(
      () =>
        ({
          getRowCount: () => 1,
          getSchema: () => schema,
          getRows: () => rows,
          getCell: (r: number, f: string) =>
            (rows[r] as Record<string, unknown> | undefined)?.[f] ?? null,
          subscribe: () => () => {},
          updateCell,
        }) as never,
    )
    engine.getSelection = mock(() => ({
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 0, colIndex: 0 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
    }))
    engine.clearRange = mock(() => {})
    const adapter = {
      writeText: mock(async (_: string) => true),
      readText: mock(async () => ''),
    }
    const runtime = new GridRuntime({ engine, host: makeHost(), renderer: makeRenderer() })
    runtime.setClipboardAdapter(adapter as never)
    return { engine, runtime, adapter }
  }

  it('Ctrl+C 触发 copy', async () => {
    const { runtime, adapter } = setup()
    expect(
      runtime.handleHostKeyDown({
        key: 'c',
        ctrlKey: true,
        shiftKey: false,
        metaKey: false,
        altKey: false,
      }),
    ).toBe(true)
    await Promise.resolve()
    expect(adapter.writeText).toHaveBeenCalled()
  })

  it('Cmd+C（macOS）等价 Ctrl+C', async () => {
    const { runtime, adapter } = setup()
    runtime.handleHostKeyDown({
      key: 'c',
      ctrlKey: false,
      shiftKey: false,
      metaKey: true,
      altKey: false,
    })
    await Promise.resolve()
    expect(adapter.writeText).toHaveBeenCalled()
  })

  it('Ctrl+X 触发 cut（清原格）', async () => {
    const { engine, runtime } = setup()
    runtime.handleHostKeyDown({
      key: 'x',
      ctrlKey: true,
      shiftKey: false,
      metaKey: false,
      altKey: false,
    })
    await Promise.resolve()
    expect(engine.clearRange).toHaveBeenCalled()
  })

  it('Ctrl+V 触发 paste', async () => {
    const { runtime, adapter } = setup()
    adapter.readText = mock(async () => 'pasted\t9')
    runtime.handleHostKeyDown({
      key: 'v',
      ctrlKey: true,
      shiftKey: false,
      metaKey: false,
      altKey: false,
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(adapter.readText).toHaveBeenCalled()
  })

  it('编辑中 Ctrl+C 不被 runtime 拦截（让浏览器原生剪贴板接管）', () => {
    const { engine, runtime } = setup()
    engine.isCellEditing = mock(() => true)
    expect(
      runtime.handleHostKeyDown({
        key: 'c',
        ctrlKey: true,
        shiftKey: false,
        metaKey: false,
        altKey: false,
      }),
    ).toBe(false)
  })

  it('Shift+Ctrl+C 不触发剪贴板（避免误抢系统快捷键）', () => {
    const { runtime, adapter } = setup()
    const handled = runtime.handleHostKeyDown({
      key: 'c',
      ctrlKey: true,
      shiftKey: true,
      metaKey: false,
      altKey: false,
    })
    expect(handled).toBe(false)
    expect(adapter.writeText).not.toHaveBeenCalled()
  })
})

describe('GridRuntime menu default dispatch — Phase 4.1', () => {
  function setup() {
    const engine = makeEngine()
    const rows = [{ a: 'x' }] as Row[]
    const schema: Schema = {
      fields: [{ id: 'a', name: 'A', type: 'text', width: 100 }],
    }
    engine.getData = mock(
      () =>
        ({
          getRowCount: () => 1,
          getSchema: () => schema,
          getRows: () => rows,
          getCell: (r: number, f: string) =>
            (rows[r] as Record<string, unknown> | undefined)?.[f] ?? null,
          subscribe: () => () => {},
          updateCell: mock(() => {}),
        }) as never,
    )
    engine.getSelection = mock(() => ({
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 0, colIndex: 0 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
    }))
    engine.clearRange = mock(() => {})
    const adapter = {
      writeText: mock(async (_: string) => true),
      readText: mock(async () => ''),
    }
    const runtime = new GridRuntime({ engine, host: makeHost(), renderer: makeRenderer() })
    runtime.setClipboardAdapter(adapter as never)
    return { engine, runtime, adapter }
  }

  it('consumer 没传 onContextMenuAction 时点 copy 自动走 grid.copy()', async () => {
    const { runtime, adapter } = setup()
    runtime.handleContextMenuSelected('copy')
    await Promise.resolve()
    expect(adapter.writeText).toHaveBeenCalled()
  })

  it('consumer 没传 onContextMenuAction 时点 cut 自动走 grid.cut()', async () => {
    const { engine, runtime } = setup()
    runtime.handleContextMenuSelected('cut')
    await Promise.resolve()
    expect(engine.clearRange).toHaveBeenCalled()
  })

  it('consumer 传了 onContextMenuAction 时优先 callback，不调内部引擎', async () => {
    const { runtime, adapter } = setup()
    const consumer = mock((_a: string, _c: never) => {})
    runtime.setOnContextMenuAction(consumer as never)
    // 模拟 menu 走过一次 open，存了 lastContextMenuContext
    ;(runtime as unknown as { lastContextMenuContext: unknown }).lastContextMenuContext = {
      targetKind: 'cell',
      cell: { rowIndex: 0, colIndex: 0 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
      hasSelection: true,
      clipboardReady: true,
    }
    runtime.handleContextMenuSelected('copy')
    await Promise.resolve()
    expect(consumer).toHaveBeenCalled()
    expect(adapter.writeText).not.toHaveBeenCalled()
  })
})
