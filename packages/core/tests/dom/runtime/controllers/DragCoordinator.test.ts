import { describe, expect, it, mock } from 'bun:test'
import { DragCoordinator } from '../../../../src/dom/runtime/controllers/DragCoordinator'
import { makeMockGridEngine } from '../../../helpers/mock-grid-engine'
import type { WebHost } from '../../../../src/dom/host/Host'
import { resolveSelectionBehavior } from '../../../../src/kernel/interaction/SelectionBehavior'

function makeCoordinator() {
  const cancel = mock(() => {})
  const host = {
    getContainerSize: () => ({ width: 400, height: 300 }),
    getScrollPosition: () => ({ scrollTop: 0, scrollLeft: 0 }),
    scrollTo: mock(() => {}),
  } as unknown as WebHost
  const drag = new DragCoordinator({
    engine: makeMockGridEngine(),
    host,
    scheduler: { schedule: (_k: string, cb: () => void) => { cb() }, cancel },
    isDestroyed: () => false,
    refresh: () => {},
    afterEngineMutation: () => {},
    closeContextMenu: () => {},
    commitCellEdit: () => {},
    autofitRows: () => ({ changedRows: 0, skippedRows: 0 }),
    onFill: () => {},
    syncFillHandle: () => {},
    syncResizeHandles: () => {},
    handleHostScroll: () => {},
    getScrollLimits: () => ({ maxTop: 1000, maxLeft: 1000 }),
    getColsTotalSize: () => 4000,
    hitTestGroupHeader: () => null,
    hitTestGroupHeaderAtLevel: () => null,
    hitTestColumnHeader: () => null,
    hitTestRowHeader: () => null,
    isWholeColumnSelection: () => false,
    isWholeRowSelection: () => false,
    selectWholeColumn: () => {},
    selectWholeColumnRange: () => {},
    selectWholeRowRange: () => {},
    selectAllCells: () => {},
    getSelectionBehavior: () => resolveSelectionBehavior(),
  })
  return { drag, cancel }
}

describe('DragCoordinator — 编排状态', () => {
  it('无 active drag 时 cancel/commit/move 均为 no-op 且不阻塞', () => {
    const { drag } = makeCoordinator()
    expect(drag.cancelActiveDrag()).toBe(false)
    expect(drag.commitActiveDrag()).toBe(false)
    expect(drag.moveActiveDrag({ x: 0, y: 0 } as never)).toBe(false)
    expect(drag.isDragBlocked()).toBe(false)
    expect(drag.isAnyDragActive()).toBe(false)
  })

  it('destroy 幂等:二次调用不抛且每次都取消 auto-scroll 调度', () => {
    const { drag, cancel } = makeCoordinator()
    drag.destroy()
    drag.destroy()
    expect(cancel.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})
