import { describe, expect, it, mock } from 'bun:test'
import { SelectionDrag } from '../../../src/interaction/drag/SelectionDrag'
import type { WebPointerEvent } from '../../../src/host/WebHost'
import { makeMockGridEngine } from '../../helpers/mock-grid-engine'

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
})
