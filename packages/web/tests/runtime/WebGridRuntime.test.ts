import { describe, expect, it, mock, spyOn } from 'bun:test'
import type {
  CellAddress,
  DataSource,
  GridEngine,
  GridSelection,
  ResizeHandleRect,
  Row,
  Schema,
  Theme,
} from '@novasheet/core'
import type { WebHost } from '../../src/host/WebHost'
import type { WebRenderer } from '../../src/render/WebRenderer'
import { WebGridRuntime } from '../../src/runtime/WebGridRuntime'

function makeEngine(): GridEngine {
  return {
    setData: mock(() => {}),
    setTheme: mock(() => {}),
    setFrozen: mock(() => {}),
    setViewportSize: mock(() => {}),
    setHeaderHeight: mock(() => {}),
    setScroll: mock(() => {}),
    setRowHeight: mock(() => {}),
    setColumnWidth: mock(() => {}),
    selectCell: mock(() => {}),
    navigateSelection: mock(() => false),
    beginCellEdit: mock(() => false),
    updateCellEditDraft: mock(() => {}),
    cancelCellEdit: mock(() => {}),
    commitCellEdit: mock(() => false),
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
  }
}

function makeHost(): WebHost {
  return {
    attach: mock(() => {}),
    applyScrollbarTheme: mock(() => {}),
    setScrollSize: mock(() => {}),
    scrollTo: mock(() => {}),
    getDpr: () => 1,
    getContainerSize: () => ({ width: 400, height: 300 }),
    getContainerBoundingRect: () => ({ left: 0, top: 0 }),
    getScrollPosition: () => ({ scrollTop: 0, scrollLeft: 0 }),
    focusScrollHost: mock(() => {}),
    destroy: mock(() => {}),
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

    expect(engine.selectCell).toHaveBeenCalledWith({ rowIndex: 1, colIndex: 1 } satisfies CellAddress)
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
    expect(engine.selectCell).toHaveBeenLastCalledWith({ rowIndex: 9, colIndex: 2 }, { extend: true })

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
    }))

    const editor = {
      open: mock(() => {}),
      close: mock(() => {}),
      isOpen: mock(() => false),
      syncRect: mock(() => {}),
      applyTheme: mock(() => {}),
    }
    const runtime = new WebGridRuntime({ engine, host: makeHost(), renderer: makeRenderer() })
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
  function makeContextMenu() {
    return {
      open: mock(() => {}),
      close: mock(() => {}),
      isOpen: mock(() => false),
      applyTheme: mock(() => {}),
      destroy: mock(() => {}),
      attach: mock(() => {}),
    }
  }

  it('drag-select 进行中不开菜单', () => {
    const engine = makeEngine()
    const runtime = new WebGridRuntime({ engine, host: makeHost(), renderer: makeRenderer() })
    const menu = makeContextMenu()
    runtime.setContextMenuLayer(menu as never)
    ;(runtime as unknown as { draggingSelection: boolean }).draggingSelection = true
    runtime.handleHostContextMenu({ x: 100, y: 100, shiftKey: false, clientX: 100, clientY: 100 })
    expect(menu.open).not.toHaveBeenCalled()
  })

  it('右键 pointerdown（button=2）不进入 drag-select 模式', () => {
    const engine = makeEngine()
    engine.getFrame = mock(() => ({
      data: {} as never,
      theme: { metrics: { headerHeight: 32 } } as never,
      rowsAxis: { indexToPosition: () => 0, getSize: () => 28, positionToIndex: (p: number) => Math.floor(p / 28) } as never,
      colsAxis: { indexToPosition: () => 0, getSize: () => 100, positionToIndex: (p: number) => Math.floor(p / 100) } as never,
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
    }))
    const runtime = new WebGridRuntime({ engine, host: makeHost(), renderer: makeRenderer() })
    runtime.handleHostPointerDown({ x: 50, y: 60, shiftKey: false, button: 2 })
    expect((runtime as unknown as { draggingSelection: boolean }).draggingSelection).toBe(false)
    expect(engine.selectCell).not.toHaveBeenCalled()
  })

  it('cell 编辑中先 commit 再开菜单', () => {
    const engine = makeEngine()
    engine.isCellEditing = mock(() => true)
    engine.commitCellEdit = mock(() => true)
    engine.getFrame = mock(() => ({
      data: {} as never,
      theme: { metrics: { headerHeight: 32 } } as never,
      rowsAxis: { indexToPosition: () => 0, getSize: () => 28, positionToIndex: (pos: number) => Math.floor(pos / 28) } as never,
      colsAxis: { indexToPosition: () => 0, getSize: () => 100, positionToIndex: (pos: number) => Math.floor(pos / 100) } as never,
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
    }))
    const runtime = new WebGridRuntime({ engine, host: makeHost(), renderer: makeRenderer() })
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

  it('命中 header band 不开菜单', () => {
    const engine = makeEngine()
    engine.getFrame = mock(() => ({
      data: {} as never,
      theme: { metrics: { headerHeight: 32 } } as never,
      rowsAxis: { indexToPosition: () => 0, getSize: () => 28, positionToIndex: (pos: number) => Math.floor(pos / 28) } as never,
      colsAxis: { indexToPosition: () => 0, getSize: () => 100, positionToIndex: (pos: number) => Math.floor(pos / 100) } as never,
      viewport: { regions: [] } as never,
    }))
    const runtime = new WebGridRuntime({ engine, host: makeHost(), renderer: makeRenderer() })
    const menu = makeContextMenu()
    runtime.setContextMenuLayer(menu as never)
    // y < headerHeight (32) means header band
    runtime.handleHostContextMenu({ x: 50, y: 10, shiftKey: false, clientX: 50, clientY: 10 })
    expect(menu.open).not.toHaveBeenCalled()
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
      rowsAxis: { indexToPosition: () => 0, getSize: () => 28, positionToIndex: (pos: number) => Math.floor(pos / 28) } as never,
      colsAxis: { indexToPosition: () => 0, getSize: () => 100, positionToIndex: (pos: number) => Math.floor(pos / 100) } as never,
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
    }))
    const runtime = new WebGridRuntime({ engine, host: makeHost(), renderer: makeRenderer() })
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
    const runtime = new WebGridRuntime({ engine, host: makeHost(), renderer: makeRenderer() })
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

  it('拖拽中只更新预览，松手才 setColumnWidth', () => {
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
    expect(engine.setColumnWidth).not.toHaveBeenCalled()
    expect(showIndicator).toHaveBeenCalled()

    runtime.handleResizePointerMove(1, 130, 0)
    expect(engine.setColumnWidth).not.toHaveBeenCalled()
    expect(showIndicator).toHaveBeenCalledTimes(2)

    runtime.handleResizePointerUp(1)
    expect(engine.setColumnWidth).toHaveBeenCalledTimes(1)
    expect(engine.setColumnWidth).toHaveBeenCalledWith('name', 130)
    expect(hideIndicator).toHaveBeenCalled()
  })

  it('无位移松手不提交', () => {
    const engine = makeEngine()
    engine.getColumnIndex = () => 0
    engine.getColsAxis = () =>
      ({
        getSize: () => 100,
      }) as never

    const runtime = new WebGridRuntime({
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

    expect(engine.setColumnWidth).not.toHaveBeenCalled()
  })
})

describe('WebGridRuntime clipboard — Phase 4.1', () => {
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
      getCell: (r: number, f: string) => (rows[r] as Record<string, unknown> | undefined)?.[f] ?? null,
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

  function setupForCopyCut(activeCell = { rowIndex: 0, colIndex: 0 }, range = {
    startRow: 0,
    endRow: 0,
    startCol: 0,
    endCol: 1,
  }) {
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
    const runtime = new WebGridRuntime({ engine, host: makeHost(), renderer: makeRenderer() })
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
    ;(runtime as unknown as { clipboardAdapter: { readText: () => Promise<null> } }).clipboardAdapter = {
      writeText: async () => true,
      readText: async () => null,
    } as never
    expect(await runtime.handleClipboardPaste()).toBe(false)
    expect(data.updateCell).not.toHaveBeenCalled()
  })

  it('paste 内部缓存命中走 typed 路径（保留类型）', async () => {
    const { runtime, adapter, data } = setupForCopyCut()
    await runtime.handleClipboardCopy()
    // adapter.readText 返回 copy 时写入的同样 TSV → 内部缓存 hash 命中
    adapter.readText = mock(async () => 'hello\t42')
    expect(await runtime.handleClipboardPaste()).toBe(true)
    // typed 路径：number 字段值保留为 42（不是字符串）
    const writeCalls = data.updateCell.mock.calls
    const bWrite = writeCalls.find((c) => c[1] === 'b')
    expect(bWrite?.[2]).toBe(42)
  })

  it('paste 外部 TSV（hash 不匹配）走 parse + coerce 路径', async () => {
    const { runtime, adapter, data } = setupForCopyCut()
    // 没 copy 过，clipboardCache 为 null；外部 TSV
    adapter.readText = mock(async () => 'external\t99')
    expect(await runtime.handleClipboardPaste()).toBe(true)
    const writeCalls = data.updateCell.mock.calls
    expect(writeCalls.map((c) => [c[1], c[2]])).toEqual([
      ['a', 'external'],
      ['b', 99],
    ])
  })

  it('paste 类型不匹配触发 onPasteSkipped', async () => {
    const { runtime, adapter } = setupForCopyCut()
    const skipped = mock((_: readonly { rowIndex: number; fieldId: string; reason: string }[]) => {})
    runtime.setOnPasteSkipped(skipped as never)
    adapter.readText = mock(async () => 'ok\tabc')  // 'abc' → number 列 → skip
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
    const runtime = new WebGridRuntime({ engine, host: makeHost(), renderer: makeRenderer() })
    runtime.setClipboardAdapter(adapter as never)

    expect(await runtime.handleClipboardCut()).toBe(false)
    expect(await runtime.handleClipboardPaste()).toBe(false)
    expect(await runtime.handleClipboardCopy()).toBe(true) // copy 不要求 mutable
  })
})
