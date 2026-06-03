import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { createSheetContext, FilterLayer, InMemoryDataSource, SortLayer, ViewPipeline } from '@novasheet/core'
import { installContextMenuFeature } from '@novasheet/feature-context-menu'
import { installSortFilterFeature } from '@novasheet/feature-sort-filter'
import type {
  CellAddress,
  CellValue,
  DataSource,
  GridEngine,
  GridSelection,
  ResizeHandleRect,
  Schema,
  Theme,
} from '@novasheet/core'
import type { WebHost } from '../../src/host/WebHost'
import type { WebRenderer } from '../../src/render/WebRenderer'
import { WebGridRuntime } from '../../src/runtime/WebGridRuntime'

function makeEngine(): GridEngine {
  return {
    setData: mock(() => {}),
    setViewData: mock(() => {}),
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
    setCellValue: mock((_cell: CellAddress, _value: CellValue) => false),
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
    getViewport: mock(() => ({}) as never),
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
    setTextWrap: mock(() => false),
    getCellFormat: mock(() => undefined),
    mergeCells: mock(() => false),
    unmergeCells: mock(() => false),
    getMergeRegion: mock(() => null),
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
    container: document.createElement('div'),
  }
}

function makeRenderer(): WebRenderer {
  return {
    mount: mock(() => {}),
    resize: mock(() => {}),
    render: mock(() => {}),
    destroy: mock(() => {}),
  }
}

describe('WebGridRuntime.replaceRenderer — 更换渲染器', () => {
  it('销毁旧 renderer 并安装 factory 产物', () => {
    const engine = makeEngine()
    const host = makeHost()
    const first = makeRenderer()
    const second = makeRenderer()
    const runtime = new WebGridRuntime({ engine, host, renderer: first })

    const installed = runtime.replaceRenderer(() => second)

    expect(first.destroy).toHaveBeenCalledTimes(1)
    expect(installed).toBe(second)
    expect(second.destroy).not.toHaveBeenCalled()
  })
})

describe('WebGridRuntime.setData — 换数据', () => {
  it('更新 engine、经 factory 换 renderer 并 refresh', () => {
    const engine = makeEngine()
    const host = makeHost()
    const first = makeRenderer()
    const second = makeRenderer()
    const runtime = new WebGridRuntime({ engine, host, renderer: first })
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

describe('WebGridRuntime.scheduleHostResize — 合并 resize', () => {
  it('合并 resize 回调，RAF 内 paintSync', () => {
    const engine = makeEngine()
    const host = makeHost()
    const renderer = makeRenderer()
    const onSurfaceResize = mock(() => {})
    const runtime = new WebGridRuntime({ engine, host, renderer, onSurfaceResize })

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

describe('WebGridRuntime.setTheme — 换主题', () => {
  it('更新 engine、可选 patch renderer 后 refresh', () => {
    const engine = makeEngine()
    const host = makeHost()
    const renderer = makeRenderer()
    const runtime = new WebGridRuntime({ engine, host, renderer })
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

describe('WebGridRuntime.handleHostPointerDown — 点击选择', () => {
  it('命中 body 单元格后更新 selection 并请求重绘', () => {
    const engine = makeEngine()
    const host = makeHost()
    const renderer = makeRenderer()
    const runtime = new WebGridRuntime({ engine, host, renderer })
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
    const runtime = new WebGridRuntime({ engine, host, renderer })

    runtime.handleHostPointerDown({ x: 120, y: 72, shiftKey: true })

    expect(engine.selectCell).toHaveBeenCalledWith(
      { rowIndex: 1, colIndex: 1 } satisfies CellAddress,
      { extend: true },
    )
  })

})

describe('WebGridRuntime drag selection — 拖拽框选', () => {
  it('pointerdown 后 pointermove 用 anchor 扩展选区，pointerup 后停止扩展', () => {
    const engine = makeEngine()
    const host = makeHost()
    const renderer = makeRenderer()
    const runtime = new WebGridRuntime({ engine, host, renderer })

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
    const runtime = new WebGridRuntime({ engine, host, renderer })

    runtime.handleHostPointerDown({ x: 20, y: 12, shiftKey: false })
    runtime.handleHostPointerMove({ x: 220, y: 100, shiftKey: false })

    expect(engine.selectCell).not.toHaveBeenCalled()
  })
})

describe('WebGridRuntime drag auto-scroll — 拖选带动滚动', () => {
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
    const runtime = new WebGridRuntime({ engine, host, renderer })

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
    const runtime = new WebGridRuntime({ engine, host, renderer })

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

describe('WebGridRuntime keyboard navigation — Phase 3.3', () => {
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
    const runtime = new WebGridRuntime({ engine, host, renderer: makeRenderer() })

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
    const runtime = new WebGridRuntime({ engine, host: makeHost(), renderer: makeRenderer() })

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
    const runtime = new WebGridRuntime({ engine, host: makeHost(), renderer: makeRenderer() })

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

describe('WebGridRuntime contextmenu — Phase 4.0', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  function openMenuItemIds(doc: Document = document): string[] {
    const menu = doc.querySelector('[data-novasheet-context-menu][data-open]')
    if (!menu) return []
    return Array.from(menu.querySelectorAll('[data-ns-action]')).map(
      (el) => el.getAttribute('data-ns-action')!,
    )
  }

  function isContextMenuOpen(doc: Document = document): boolean {
    return doc.querySelector('[data-novasheet-context-menu][data-open]') !== null
  }

  function filterPopoverOpen(): boolean {
    return document.querySelector('[data-novasheet-filter-popover][data-open]') !== null
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
    const ctx = createSheetContext()
    installSortFilterFeature(ctx)
    installContextMenuFeature(ctx)
    const runtime = new WebGridRuntime({
      engine,
      context: ctx,
      host: makeHost(),
      renderer: makeRenderer(),
      viewPipeline: pipeline,
      sortLayer,
      filterLayer,
    })
    return { engine, runtime, sortLayer, filterLayer }
  }

  it('drag-select 进行中不开菜单', () => {
    const engine = makeEngine()
    const runtime = new WebGridRuntime({ engine, host: makeHost(), renderer: makeRenderer() })
    runtime.handleHostPointerDown({ x: 50, y: 60, shiftKey: false, button: 0 })
    runtime.handleHostPointerMove({ x: 120, y: 120, shiftKey: false, button: 0 })
    runtime.handleHostContextMenu({ x: 100, y: 100, shiftKey: false, clientX: 100, clientY: 100 })
    expect(isContextMenuOpen()).toBe(false)
    runtime.destroy()
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
    const runtime = new WebGridRuntime({ engine, host: makeHost(), renderer: makeRenderer() })
    runtime.handleHostPointerDown({ x: 50, y: 60, shiftKey: false, button: 2 })
    expect(engine.selectCell).not.toHaveBeenCalled()
  })

  it('right-click within header opens column header menu', () => {
    const { runtime } = makeHeaderRuntime()

    runtime.handleHostContextMenu({ x: 150, y: 10, shiftKey: false, clientX: 150, clientY: 10 })

    expect(openMenuItemIds().slice(0, 5)).toEqual([
      'filter-open',
      'filter-clear',
      'sort-asc',
      'sort-desc',
      'sort-none',
    ])
    runtime.destroy()
  })

  it('keeps sort actions enabled for sortable columns when selection spans columns', () => {
    const { engine, runtime } = makeHeaderRuntime()
    engine.getSelection = mock(() => ({
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 0, colIndex: 1 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 1 },
    }))

    runtime.handleHostContextMenu({ x: 150, y: 10, shiftKey: false, clientX: 150, clientY: 10 })

    const sortAsc = document.querySelector('[data-ns-action="sort-asc"]')
    const sortDesc = document.querySelector('[data-ns-action="sort-desc"]')
    expect(sortAsc?.getAttribute('aria-disabled')).not.toBe('true')
    expect(sortDesc?.getAttribute('aria-disabled')).not.toBe('true')
    runtime.destroy()
  })

  it('right-click in row-header gutter does not open column header menu', () => {
    const { runtime } = makeHeaderRuntime({ rowHeaderWidth: 48 })

    runtime.handleHostContextMenu({ x: 24, y: 10, shiftKey: false, clientX: 24, clientY: 10 })

    expect(isContextMenuOpen()).toBe(false)
    runtime.destroy()
  })

  it('right-click in blank header space right of columns does not open menu', () => {
    const { runtime } = makeHeaderRuntime({ rowHeaderWidth: 48, columnWidth: 100 })

    runtime.handleHostContextMenu({ x: 260, y: 10, shiftKey: false, clientX: 260, clientY: 10 })

    expect(isContextMenuOpen()).toBe(false)
    runtime.destroy()
  })

  it('right-click in body still opens cell menu', () => {
    const { runtime } = makeHeaderRuntime()

    runtime.handleHostContextMenu({ x: 50, y: 60, shiftKey: false, clientX: 50, clientY: 60 })

    expect(openMenuItemIds()).toEqual(['cut', 'copy', 'paste'])
    runtime.destroy()
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
    runtime.destroy()
  })

  it('filter-open closes context menu and opens filter popover for the header field', () => {
    const { runtime, filterLayer } = makeHeaderRuntime()
    filterLayer.setSpec({ fieldId: 'score', op: { kind: 'number-between', min: 1, max: null } })

    runtime.handleHostContextMenu({ x: 150, y: 10, shiftKey: false, clientX: 160, clientY: 20 })
    runtime.handleContextMenuSelected('filter-open')

    expect(isContextMenuOpen()).toBe(false)
    expect(filterPopoverOpen()).toBe(true)
    const popover = document.querySelector('[data-novasheet-filter-popover][data-open]') as HTMLElement
    expect(popover.style.left).toBe('160px')
    expect(popover.style.top).toBe('20px')
    runtime.destroy()
  })

  it('filter popover Apply updates and clears the active field filter', () => {
    const { runtime, filterLayer } = makeHeaderRuntime()

    runtime.handleHostContextMenu({ x: 150, y: 10, shiftKey: false, clientX: 160, clientY: 20 })
    runtime.handleContextMenuSelected('filter-open')
    const min = document.body.querySelector('[data-ns-filter-min]') as HTMLInputElement
    const max = document.body.querySelector('[data-ns-filter-max]') as HTMLInputElement
    min.value = '1'
    min.dispatchEvent(new Event('input', { bubbles: true }))
    max.value = '3'
    max.dispatchEvent(new Event('input', { bubbles: true }))
    ;(document.body.querySelector('[data-ns-filter-apply]') as HTMLButtonElement).click()
    expect(filterLayer.getSpec()).toEqual({
      fieldId: 'score',
      op: { kind: 'number-between', min: 1, max: 3 },
    })

    runtime.handleHostContextMenu({ x: 150, y: 10, shiftKey: false, clientX: 160, clientY: 20 })
    runtime.handleContextMenuSelected('filter-open')
    ;(document.body.querySelector('[data-ns-filter-clear]') as HTMLButtonElement).click()
    expect(filterLayer.getSpec()).toBeNull()
    runtime.destroy()
  })

  it('filter popover open gates grid keyboard handling', () => {
    const { runtime, engine } = makeHeaderRuntime()

    runtime.handleHostContextMenu({ x: 150, y: 10, shiftKey: false, clientX: 160, clientY: 20 })
    runtime.handleContextMenuSelected('filter-open')
    expect(filterPopoverOpen()).toBe(true)

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
    runtime.destroy()
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
    const ctx = createSheetContext()
    installSortFilterFeature(ctx)
    installContextMenuFeature(ctx)
    const runtime = new WebGridRuntime({
      engine,
      context: ctx,
      host: makeHost(),
      renderer: makeRenderer(),
    })

    // 命中 (rowIndex=2, colIndex=1) — 在 range (0,0,0,0) 外
    runtime.handleHostContextMenu({ x: 150, y: 100, shiftKey: false, clientX: 150, clientY: 100 })
    expect(selectCell).toHaveBeenCalledWith({ rowIndex: 2, colIndex: 1 })

    selectCell.mockClear()
    // 命中 (0, 0) — 在 range 内
    runtime.handleHostContextMenu({ x: 50, y: 40, shiftKey: false, clientX: 50, clientY: 40 })
    expect(selectCell).not.toHaveBeenCalled()
    runtime.destroy()
  })

  it('setData / scroll 自动关闭菜单（via afterEngineMutation）', () => {
    const engine = makeEngine()
    const ctx = createSheetContext()
    installSortFilterFeature(ctx)
    installContextMenuFeature(ctx)
    const runtime = new WebGridRuntime({
      engine,
      context: ctx,
      host: makeHost(),
      renderer: makeRenderer(),
    })
    runtime.handleHostContextMenu({ x: 50, y: 60, shiftKey: false, clientX: 50, clientY: 60 })
    expect(isContextMenuOpen()).toBe(true)

    runtime.setData({} as never, () => makeRenderer())
    expect(isContextMenuOpen()).toBe(false)

    runtime.handleHostContextMenu({ x: 50, y: 60, shiftKey: false, clientX: 50, clientY: 60 })
    expect(isContextMenuOpen()).toBe(true)
    runtime.handleHostScroll(100, 0)
    expect(isContextMenuOpen()).toBe(false)
    runtime.destroy()
  })
})

describe('WebGridRuntime column resize — Phase 3.4', () => {
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

  it('resize pointer methods no-op when resize feature is not installed', () => {
    const engine = makeEngine()
    engine.getColumnIndex = () => 0
    engine.getColsAxis = () =>
      ({
        getSize: () => 100,
      }) as never

    const showIndicator = mock(() => {})
    const hideIndicator = mock(() => {})
    const runtime = new WebGridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      handleLayer: { showIndicator, hideIndicator, sync: mock(() => {}) } as never,
    })

    runtime.handleResizePointerDown(columnHandle, 1, 100, 0)
    runtime.handleResizePointerMove(1, 130, 0)
    runtime.handleResizePointerUp(1)

    expect(engine.commitColumnResize).not.toHaveBeenCalled()
    expect(showIndicator).not.toHaveBeenCalled()
    expect(hideIndicator).not.toHaveBeenCalled()
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

    const runtime = new WebGridRuntime({
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
