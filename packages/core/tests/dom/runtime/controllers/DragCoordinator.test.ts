import { describe, expect, it, mock } from 'bun:test'
import { DragCoordinator } from '../../../../src/dom/runtime/controllers/DragCoordinator'
import { makeMockGridEngine } from '../../../helpers/mock-grid-engine'
import type { WebHost } from '../../../../src/dom/host/Host'
import type { ColumnGroupHeaderHit } from '../../../../src/dom/interaction/ColumnGroupHeaderHit'
import { resolveSelectionBehavior } from '../../../../src/kernel/interaction/SelectionBehavior'

function makeCoordinator(options: { groupHit?: ColumnGroupHeaderHit } = {}) {
  const pending = new Map<string, () => void>()
  const cancel = mock((key: string) => { pending.delete(key) })
  const selectWholeColumnRange = mock((_anchor: number, _extent: number) => {})
  const host = {
    getContainerSize: () => ({ width: 400, height: 300 }),
    getScrollPosition: () => ({ scrollTop: 0, scrollLeft: 0 }),
    scrollTo: mock(() => {}),
  } as unknown as WebHost
  const drag = new DragCoordinator({
    engine: makeMockGridEngine(),
    host,
    scheduler: {
      schedule: (key: string, callback: () => void) => { pending.set(key, callback) },
      cancel,
    },
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
    hitTestGroupHeader: () => options.groupHit ?? null,
    hitTestGroupHeaderAtLevel: () => options.groupHit ?? null,
    hitTestColumnHeader: () => null,
    hitTestRowHeader: () => null,
    isWholeColumnSelection: () => false,
    isWholeRowSelection: () => false,
    selectWholeColumn: () => {},
    selectWholeColumnRange,
    selectWholeRowRange: () => {},
    selectAllCells: () => {},
    getSelectionBehavior: () => resolveSelectionBehavior(),
  })
  return { drag, cancel, pending, selectWholeColumnRange }
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
    const { drag, pending } = makeCoordinator()
    drag.destroy()
    drag.destroy()
    expect(pending.size).toBe(0)
  })

  it('cancelActiveDrag 后 pointermove 不再选择且清除 auto-scroll task', () => {
    const groupHit = { groupId: 's1', level: 0, startViewCol: 1, endViewCol: 2 }
    const { drag, pending, selectWholeColumnRange } = makeCoordinator({ groupHit })
    expect(drag.tryStartDrag({ x: 150, y: 10, shiftKey: false, button: 0 })).toBe(true)
    drag.moveActiveDrag({ x: 399, y: 10, shiftKey: false })
    expect(pending.size).toBe(1)
    expect(drag.cancelActiveDrag()).toBe(true)
    const callsAfterCancel = selectWholeColumnRange.mock.calls.length
    expect(pending.size).toBe(0)
    expect(drag.moveActiveDrag({ x: 350, y: 10, shiftKey: false })).toBe(false)
    expect(selectWholeColumnRange).toHaveBeenCalledTimes(callsAfterCancel)
  })

  it('destroy 取消活跃组拖选并清除 auto-scroll task，且保持幂等', () => {
    const groupHit = { groupId: 's1', level: 0, startViewCol: 1, endViewCol: 2 }
    const { drag, pending, selectWholeColumnRange } = makeCoordinator({ groupHit })
    drag.tryStartDrag({ x: 150, y: 10, shiftKey: false, button: 0 })
    drag.moveActiveDrag({ x: 399, y: 10, shiftKey: false })
    expect(pending.size).toBe(1)
    drag.destroy()
    drag.destroy()
    const callsAfterDestroy = selectWholeColumnRange.mock.calls.length
    expect(pending.size).toBe(0)
    expect(drag.moveActiveDrag({ x: 350, y: 10, shiftKey: false })).toBe(false)
    expect(selectWholeColumnRange).toHaveBeenCalledTimes(callsAfterDestroy)
  })
})
