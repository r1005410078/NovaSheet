import { describe, expect, it, mock } from 'bun:test'
import { SelectionDrag } from '../../../../src/dom/interaction/drag/SelectionDrag'
import { resolveSelectionBehavior } from '../../../../src/kernel/interaction/SelectionBehavior'
import {
  ChunkedAxis,
  FrozenRegions,
  InMemoryDataSource,
  Viewport,
  denseGridTheme,
  type RenderFrame,
  type Schema,
} from '@zhiguang/novasheet-core'
import type { WebPointerEvent } from '../../../../src/dom/host/Host'
import { makeMockGridEngine } from '../../../helpers/mock-grid-engine'

const schema: Schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text', width: 100 },
    { id: 'b', name: 'B', type: 'text', width: 100 },
    { id: 'c', name: 'C', type: 'text', width: 100 },
  ],
}

function makeSelectionFrame(rowHeaderWidth = 0): RenderFrame {
  const data = new InMemoryDataSource({ schema, rows: [{ a: '0', b: '0', c: '0' }, { a: '1', b: '1', c: '1' }, { a: '2', b: '2', c: '2' }] })
  const rowsAxis = new ChunkedAxis({ count: 3, defaultSize: denseGridTheme.metrics.rowHeight })
  const colsAxis = new ChunkedAxis({ count: 3, defaultSize: 100 })
  const frozen = new FrozenRegions(rowsAxis, colsAxis, { topRows: 1, leftCols: 1 })
  const viewport = new Viewport(rowsAxis, colsAxis, frozen)
  viewport.setHeaderHeight(denseGridTheme.metrics.headerHeight)
  if (rowHeaderWidth > 0) viewport.setRowHeaderWidth(rowHeaderWidth)
  viewport.setSize(300, 144)
  viewport.setScroll(0, 0)
  return {
    data,
    theme: denseGridTheme,
    rowsAxis,
    colsAxis,
    viewport: viewport.snapshot(),
    collapsedRowGaps: [],
    collapsedColGaps: [],
  }
}

describe('SelectionDrag', () => {
  it('selects on pointerdown, extends on move, and only becomes active after move', () => {
    const engine = makeMockGridEngine({
      selection: {
        activeCell: { rowIndex: 0, colIndex: 0 },
        anchorCell: { rowIndex: 0, colIndex: 0 },
        extentCell: { rowIndex: 0, colIndex: 0 },
        selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
      },
    })
    const refresh = mock(() => {})
    const requestAutoScroll = mock((_pointer: WebPointerEvent) => {})
    const stopAutoScroll = mock(() => {})
    const syncFillHandle = mock(() => {})
    const drag = new SelectionDrag({
      engine,
      refresh,
      requestAutoScroll,
      stopAutoScroll,
      syncFillHandle,
      isBlocked: () => false,
      getSelectionBehavior: () => resolveSelectionBehavior(),
      selectWholeRowRange: mock((_anchor: number, _extent: number) => {}),
      selectWholeColumnRange: mock((_anchor: number, _extent: number) => {}),
      selectAllCells: mock(() => {}),
      isWholeRowSelection: () => false,
      isWholeColumnSelection: () => false,
    })

    expect(drag.tryStart({ x: 50, y: 45, shiftKey: false, button: 0 })).toBe(true)
    expect(drag.active).toBe(false)
    expect(engine.selectCell).toHaveBeenCalledWith({ rowIndex: 0, colIndex: 0 })

    expect(drag.move({ x: 150, y: 105, shiftKey: false })).toBe(true)
    expect(drag.active).toBe(true)
    expect(engine.selectCell).toHaveBeenLastCalledWith({ rowIndex: 2, colIndex: 1 }, { extend: true })
    expect(requestAutoScroll).toHaveBeenCalled()

    drag.commit()
    expect(stopAutoScroll).toHaveBeenCalled()
    expect(syncFillHandle).toHaveBeenCalled()
  })

  it('left row 配置下 pointerdown 选整行，drag 锁 row 轴', () => {
    const frame = makeSelectionFrame()
    const engine = makeMockGridEngine({ overrides: { getFrame: () => frame } })
    const selectWholeRowRange = mock((_anchor: number, _extent: number) => {})
    const drag = new SelectionDrag({
      engine,
      refresh: () => {},
      requestAutoScroll: () => {},
      stopAutoScroll: () => {},
      syncFillHandle: () => {},
      isBlocked: () => false,
      getSelectionBehavior: () => resolveSelectionBehavior({ frozenPanes: { left: 'row' } }),
      selectWholeRowRange,
      selectWholeColumnRange: () => {},
      selectAllCells: () => {},
      isWholeRowSelection: () => false,
      isWholeColumnSelection: () => false,
    })

    expect(drag.tryStart({ x: 50, y: 74, shiftKey: false, button: 0 })).toBe(true)
    expect(selectWholeRowRange).toHaveBeenLastCalledWith(1, 1)
    drag.move({ x: 150, y: 102, shiftKey: false })
    expect(selectWholeRowRange).toHaveBeenLastCalledWith(1, 2)
    expect(engine.selectCell).not.toHaveBeenCalled()
    drag.commit()
  })

  it('corner all 配置 pointerdown 全选且不进入拖拽', () => {
    const frame = makeSelectionFrame(48)
    const engine = makeMockGridEngine({ overrides: { getFrame: () => frame } })
    const selectAllCells = mock(() => {})
    const drag = new SelectionDrag({
      engine,
      refresh: () => {},
      requestAutoScroll: () => {},
      stopAutoScroll: () => {},
      syncFillHandle: () => {},
      isBlocked: () => false,
      getSelectionBehavior: () => resolveSelectionBehavior({ headerCorner: 'all' }),
      selectWholeRowRange: () => {},
      selectWholeColumnRange: () => {},
      selectAllCells,
      isWholeRowSelection: () => false,
      isWholeColumnSelection: () => false,
    })

    expect(drag.tryStart({ x: 8, y: 8, shiftKey: false, button: 0 })).toBe(true)
    expect(selectAllCells).toHaveBeenCalledTimes(1)
    expect(drag.move({ x: 100, y: 100, shiftKey: false })).toBe(false)
  })

  it('Shift+行选择沿既有整行 anchor 扩展', () => {
    const frame = makeSelectionFrame()
    const engine = makeMockGridEngine({
      selection: {
        activeCell: { rowIndex: 0, colIndex: 0 },
        anchorCell: { rowIndex: 0, colIndex: 0 },
        extentCell: { rowIndex: 0, colIndex: 2 },
        selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 2 },
      },
      overrides: { getFrame: () => frame },
    })
    const selectWholeRowRange = mock((_anchor: number, _extent: number) => {})
    const drag = new SelectionDrag({
      engine,
      refresh: () => {},
      requestAutoScroll: () => {},
      stopAutoScroll: () => {},
      syncFillHandle: () => {},
      isBlocked: () => false,
      getSelectionBehavior: () => resolveSelectionBehavior({ frozenPanes: { left: 'row' } }),
      selectWholeRowRange,
      selectWholeColumnRange: () => {},
      selectAllCells: () => {},
      isWholeRowSelection: () => true,
      isWholeColumnSelection: () => false,
    })

    expect(drag.tryStart({ x: 50, y: 102, shiftKey: true, button: 0 })).toBe(true)
    expect(selectWholeRowRange).toHaveBeenLastCalledWith(0, 2)
  })

  it('Shift+列选择沿既有整列 anchor 扩展', () => {
    const frame = makeSelectionFrame()
    const engine = makeMockGridEngine({
      selection: {
        activeCell: { rowIndex: 0, colIndex: 0 },
        anchorCell: { rowIndex: 0, colIndex: 0 },
        extentCell: { rowIndex: 2, colIndex: 0 },
        selectedRange: { startRow: 0, endRow: 2, startCol: 0, endCol: 0 },
      },
      overrides: { getFrame: () => frame },
    })
    const selectWholeColumnRange = mock((_anchor: number, _extent: number) => {})
    const drag = new SelectionDrag({
      engine,
      refresh: () => {},
      requestAutoScroll: () => {},
      stopAutoScroll: () => {},
      syncFillHandle: () => {},
      isBlocked: () => false,
      getSelectionBehavior: () => resolveSelectionBehavior({ frozenPanes: { top: 'column' } }),
      selectWholeRowRange: () => {},
      selectWholeColumnRange,
      selectAllCells: () => {},
      isWholeRowSelection: () => false,
      isWholeColumnSelection: () => true,
    })

    expect(drag.tryStart({ x: 150, y: 46, shiftKey: true, button: 0 })).toBe(true)
    expect(selectWholeColumnRange).toHaveBeenLastCalledWith(0, 1)
  })
})
