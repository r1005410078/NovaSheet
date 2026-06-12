import { describe, expect, it, mock } from 'bun:test'
import {
  denseGridTheme,
  InMemoryDataSource,
  type DataSource,
  type GridEngine,
  type GridSelection,
} from '@novasheet/core'
import { Grid } from '@novasheet/core'
import { canvas2dBackend } from '../../src/backend/canvas2dBackend'
import type { WebHost } from '@novasheet/core'
import type { RenderBackend } from '@novasheet/core'
import type { SelectionOverlay, SelectionOverlayState, DomFillHandleLayer, OverlayRect } from '@novasheet/core'
import { GridRuntime } from '@novasheet/core'
import { makeMockGridEngine } from '../helpers/mock-grid-engine'

function makeFillLayer(): DomFillHandleLayer {
  return {
    sync: mock((_rect: OverlayRect | null) => {}),
    showPreview: mock(() => {}),
    hidePreview: mock(() => {}),
    destroy: mock(() => {}),
  } as unknown as DomFillHandleLayer
}

describe('GridRuntime selection overlay', () => {
  it('syncs DOM selection overlay after setSelection render flush', () => {
    const container = document.createElement('div')
    Object.assign(container.style, { width: '480px', height: '320px' })
    document.body.appendChild(container)
    const raf = captureRaf()

    const grid = new Grid(container, {
      backend: canvas2dBackend(),
      data: new InMemoryDataSource({
        schema: {
          fields: [
            { id: 'a', name: 'A', type: 'text', width: 80 },
            { id: 'b', name: 'B', type: 'text', width: 80 },
          ],
        },
        rows: [{ a: 'A1', b: 'B1' }],
      }),
      excelHeaders: true,
    })

    grid.setSelection({
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 0, colIndex: 1 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 1 },
    })
    raf.flush()

    expect(container.querySelectorAll('[data-novasheet-selection-range]').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('[data-novasheet-selection-active]').length).toBe(1)
    grid.destroy()
    raf.restore()
  })

  it('clears DOM selection overlay when selection is empty', () => {
    const container = document.createElement('div')
    Object.assign(container.style, { width: '480px', height: '320px' })
    document.body.appendChild(container)
    const raf = captureRaf()

    const grid = new Grid(container, {
      backend: canvas2dBackend(),
      data: new InMemoryDataSource({
        schema: { fields: [{ id: 'a', name: 'A', type: 'text', width: 80 }] },
        rows: [{ a: 'A1' }],
      }),
      excelHeaders: true,
    })

    grid.setSelection({
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 0, colIndex: 0 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
    })
    raf.flush()
    expect(container.querySelectorAll('[data-novasheet-selection-range]').length).toBeGreaterThan(0)

    grid.setSelection({
      activeCell: null,
      anchorCell: null,
      extentCell: null,
      selectedRange: null,
    })
    raf.flush()

    expect(container.querySelectorAll('[data-novasheet-selection-range]').length).toBe(0)
    expect(container.querySelectorAll('[data-novasheet-selection-active]').length).toBe(0)
    grid.destroy()
    raf.restore()
  })

  it('updates existing DOM selection overlay styles when theme changes', () => {
    const container = document.createElement('div')
    Object.assign(container.style, { width: '480px', height: '320px' })
    document.body.appendChild(container)
    const raf = captureRaf()
    const grid = new Grid(container, {
      backend: canvas2dBackend(),
      data: new InMemoryDataSource({
        schema: { fields: [{ id: 'a', name: 'A', type: 'text', width: 80 }] },
        rows: [{ a: 'A1' }],
      }),
      excelHeaders: true,
    })
    const customTheme = {
      ...denseGridTheme,
      colors: {
        ...denseGridTheme.colors,
        selectionBg: 'rgba(255, 0, 0, 0.25)',
        selectionBorder: '#ff0000',
      },
    }

    grid.setSelection({
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 0, colIndex: 0 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
    })
    raf.flush()
    grid.setTheme(customTheme)
    raf.flush()

    const layer = container.querySelector<HTMLElement>('[data-novasheet-selection-layer]')!
    expect(layer.style.getPropertyValue('--novasheet-selection-bg')).toBe(
      customTheme.colors.selectionBg,
    )
    expect(layer.style.getPropertyValue('--novasheet-selection-border')).toBe(
      customTheme.colors.selectionBorder,
    )
    grid.destroy()
    raf.restore()
  })

  it('syncs selection overlay from the same frame passed to renderer.render', () => {
    const selectionOverlay = makeSelectionOverlay()
    const frame = makeFrame({
      selection: {
        activeCell: { rowIndex: 0, colIndex: 0 },
        anchorCell: { rowIndex: 0, colIndex: 0 },
        extentCell: { rowIndex: 0, colIndex: 0 },
        selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
      },
      columnWidth: 80,
    })
    const laterFrame = makeFrame({
      selection: frame.selection!,
      columnWidth: 140,
    })
    const engine = makeEngine(frame)
    let getFrameCalls = 0
    engine.getFrame = mock(() => {
      getFrameCalls += 1
      return getFrameCalls === 1 ? frame : laterFrame
    }) as GridEngine['getFrame']
    const renderer = makeRenderer()
    const runtime = new GridRuntime({
      engine,
      host: makeHost(),
      renderer,
      selectionOverlay,
    })

    ;(runtime as unknown as { paintSync(): void }).paintSync()

    expect(renderer.render).toHaveBeenLastCalledWith(frame)
    expect(selectionOverlay.sync).toHaveBeenLastCalledWith({
      rangeRects: [{ x: 0, y: 30, width: 80, height: 30 }],
      activeRect: { x: 0, y: 30, width: 80, height: 30 },
    })
  })

  it('expands active selection overlay to the containing merge region', () => {
    const selectionOverlay = makeSelectionOverlay()
    const frame = makeFrame({
      selection: {
        activeCell: { rowIndex: 0, colIndex: 0 },
        anchorCell: { rowIndex: 0, colIndex: 0 },
        extentCell: { rowIndex: 0, colIndex: 0 },
        selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
      },
      mergeRegions: [
        {
          id: 'merge-1',
          range: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
          anchor: { rowIndex: 0, colIndex: 0 },
        },
      ],
      columnWidth: 80,
    })
    const runtime = new GridRuntime({
      engine: makeEngine(frame),
      host: makeHost(),
      renderer: makeRenderer(),
      selectionOverlay,
    })

    ;(runtime as unknown as { paintSync(): void }).paintSync()

    expect(selectionOverlay.sync).toHaveBeenLastCalledWith({
      rangeRects: [{ x: 0, y: 30, width: 160, height: 60 }],
      activeRect: { x: 0, y: 30, width: 160, height: 60 },
    })
  })

  it('从合并源填充后，选区边框扩展到整个 result（不塌回源合并区）', () => {
    const selectionOverlay = makeSelectionOverlay()
    const frame = makeFrame({
      selection: {
        // 填充后：selectedRange 已是 result（源合并 ∪ 填充区），active cell 仍在源合并内
        activeCell: { rowIndex: 0, colIndex: 0 },
        anchorCell: { rowIndex: 0, colIndex: 0 },
        extentCell: { rowIndex: 1, colIndex: 1 },
        selectedRange: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
      },
      mergeRegions: [
        {
          id: 'merge-1',
          range: { startRow: 0, endRow: 1, startCol: 0, endCol: 0 }, // 源合并：col0 两行
          anchor: { rowIndex: 0, colIndex: 0 },
        },
      ],
      columnWidth: 80,
    })
    const runtime = new GridRuntime({
      engine: makeEngine(frame),
      host: makeHost(),
      renderer: makeRenderer(),
      selectionOverlay,
    })

    ;(runtime as unknown as { paintSync(): void }).paintSync()

    // result 是 rows0-1×cols0-1（width 160），不能塌回源合并 col0（width 80）
    expect(selectionOverlay.sync).toHaveBeenLastCalledWith({
      rangeRects: [{ x: 0, y: 30, width: 160, height: 60 }],
      activeRect: { x: 0, y: 30, width: 160, height: 60 },
    })
  })

  it('合并格的填充柄锚定到合并区右下角（不随内部 active cell 跳中间）', () => {
    const fillLayer = makeFillLayer()
    const frame = makeFrame({
      selection: {
        // active cell 在合并内部、selectedRange 是单格（Enter 导航后的状态）
        activeCell: { rowIndex: 1, colIndex: 0 },
        anchorCell: { rowIndex: 1, colIndex: 0 },
        extentCell: { rowIndex: 1, colIndex: 0 },
        selectedRange: { startRow: 1, endRow: 1, startCol: 0, endCol: 0 },
      },
      mergeRegions: [
        {
          id: 'merge-1',
          range: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
          anchor: { rowIndex: 0, colIndex: 0 },
        },
      ],
      columnWidth: 80,
    })
    const runtime = new GridRuntime({
      engine: makeEngine(frame),
      host: makeHost(),
      renderer: makeRenderer(),
      fillLayer,
    })

    ;(runtime as unknown as { paintSync(): void }).paintSync()

    // 合并区 rows0-1×cols0-1：右下角 = (160, 90)，手柄 8px 居中偏移 4 → (156, 86)
    expect(fillLayer.sync).toHaveBeenLastCalledWith({ x: 156, y: 86, width: 8, height: 8 })
  })

  it('clears selection overlay while cell editing', () => {
    const selectionOverlay = makeSelectionOverlay()
    const engine = makeEngine(
      makeFrame({
        selection: {
          activeCell: { rowIndex: 0, colIndex: 0 },
          anchorCell: { rowIndex: 0, colIndex: 0 },
          extentCell: { rowIndex: 0, colIndex: 0 },
          selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
        },
        columnWidth: 80,
      }),
    )
    engine.isCellEditing = mock(() => true) as GridEngine['isCellEditing']
    const runtime = new GridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      selectionOverlay,
    })

    ;(runtime as unknown as { paintSync(): void }).paintSync()

    expect(selectionOverlay.sync).toHaveBeenLastCalledWith(null)
  })
})

function captureRaf(): { flush: () => void; restore: () => void } {
  const original = globalThis.requestAnimationFrame
  const callbacks: FrameRequestCallback[] = []
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    callbacks.push(cb)
    return callbacks.length
  }) as typeof requestAnimationFrame
  return {
    flush: () => callbacks.shift()?.(performance.now()),
    restore: () => {
      globalThis.requestAnimationFrame = original
    },
  }
}

function makeSelectionOverlay(): SelectionOverlay {
  return {
    sync: mock((_state: SelectionOverlayState | null) => {}),
    destroy: mock(() => {}),
  } as unknown as SelectionOverlay
}

function makeFrame(options: {
  selection: GridSelection
  columnWidth: number
  mergeRegions?: ReturnType<GridEngine['getFrame']>['mergeRegions']
}): ReturnType<GridEngine['getFrame']> {
  const data = {
    getRowCount: () => 2,
    getSchema: () => ({
      fields: [
        { id: 'a', name: 'A', type: 'text', width: options.columnWidth },
        { id: 'b', name: 'B', type: 'text', width: options.columnWidth },
      ],
    }),
    getRows: () => [],
    getCell: () => null,
    subscribe: () => () => {},
  } as unknown as DataSource
  return {
    data,
    theme: denseGridTheme,
    rowsAxis: {
      getCount: () => 2,
      indexToPosition: (i: number) => i * 30,
      positionToIndex: (pos: number) => Math.floor(pos / 30),
      getSize: () => 30,
    } as never,
    colsAxis: {
      getCount: () => 2,
      indexToPosition: (i: number) => i * options.columnWidth,
      positionToIndex: (pos: number) => Math.floor(pos / options.columnWidth),
      getSize: () => options.columnWidth,
    } as never,
    viewport: {
      contentRect: { width: 400, height: 300 },
      regions: [
        {
          id: 'main',
          rowBand: 'middle',
          colBand: 'center',
          rowRange: [0, 1],
          colRange: [0, 1],
          rect: { x: 0, y: 30, width: options.columnWidth * 2, height: 270 },
          scrollOffsetX: 0,
          scrollOffsetY: 0,
          zIndex: 0,
        },
      ],
    } as never,
    collapsedRowGaps: [],
    collapsedColGaps: [],
    selection: options.selection,
    mergeRegions: options.mergeRegions,
  }
}

function makeEngine(frame: ReturnType<GridEngine['getFrame']>): GridEngine {
  return makeMockGridEngine({
    frame,
    overrides: {
      getRowsTotalSize: () => 30,
      getColsTotalSize: () => 80,
      getColumnIndex: () => 0,
      getTheme: () => denseGridTheme,
    },
  })
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
