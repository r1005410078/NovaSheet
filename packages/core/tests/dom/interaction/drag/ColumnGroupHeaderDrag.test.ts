import { describe, expect, it, mock } from 'bun:test'
import { ColumnGroupHeaderDrag } from '../../../../src/dom/interaction/drag/ColumnGroupHeaderDrag'
import type { WebPointerEvent } from '../../../../src/dom/host/Host'
import type { ColumnGroupHeaderHit } from '../../../../src/dom/interaction/ColumnGroupHeaderHit'
import type { CellRange, GridSelection } from '@zhiguang/novasheet-core'
import { makeMockGridEngine } from '../../../helpers/mock-grid-engine'

const s1 = { groupId: 's1', level: 0, startViewCol: 1, endViewCol: 2 }
const s2 = { groupId: 's2', level: 0, startViewCol: 3, endViewCol: 4 }

function makeDrag(options: {
  selection?: GridSelection
  isWholeColumnSelection?: (range: CellRange) => boolean
  blocked?: boolean
  hitTestGroupHeader?: (event: WebPointerEvent) => ColumnGroupHeaderHit | null
} = {}) {
  const selectWholeColumnRange = mock((_anchor: number, _extent: number) => {})
  const requestAutoScroll = mock((_event: WebPointerEvent) => {})
  const stopAutoScroll = mock(() => {})
  const engine = makeMockGridEngine(options.selection ? { selection: options.selection } : {})
  const drag = new ColumnGroupHeaderDrag({
    engine,
    refresh: mock(() => {}),
    requestAutoScroll,
    stopAutoScroll,
    isBlocked: () => options.blocked ?? false,
    hitTestGroupHeader: options.hitTestGroupHeader ?? ((event) => event.x < 300 ? s1 : s2),
    hitTestGroupHeaderAtLevel: (event, level) =>
      level === 0 ? (event.x < 300 ? s1 : s2) : null,
    isWholeColumnSelection: options.isWholeColumnSelection ?? (() => false),
    selectWholeColumnRange,
  })
  return { drag, selectWholeColumnRange, requestAutoScroll, stopAutoScroll }
}

describe('ColumnGroupHeaderDrag', () => {
  it('pointerdown 选中起始组，move 锁层并扩展到目标组', () => {
    const { drag, selectWholeColumnRange } = makeDrag()
    expect(drag.tryStart({ x: 150, y: 10, shiftKey: false, button: 0 })).toBe(true)
    expect(selectWholeColumnRange).toHaveBeenLastCalledWith(1, 2)
    expect(drag.active).toBe(true)

    drag.move({ x: 350, y: 200, shiftKey: false })
    expect(selectWholeColumnRange).toHaveBeenLastCalledWith(1, 4)
  })

  it('从右向左拖选时使用起始组右边界与目标组左边界', () => {
    const { drag, selectWholeColumnRange } = makeDrag()
    drag.tryStart({ x: 350, y: 10, shiftKey: false, button: 0 })
    drag.move({ x: 150, y: 200, shiftKey: false })
    expect(selectWholeColumnRange).toHaveBeenLastCalledWith(4, 1)
  })

  it('Shift 点击沿既有整列 anchor 扩展到目标组远端', () => {
    const selection = {
      activeCell: { rowIndex: 0, colIndex: 1 },
      anchorCell: { rowIndex: 0, colIndex: 1 },
      extentCell: { rowIndex: 2, colIndex: 2 },
      selectedRange: { startRow: 0, endRow: 2, startCol: 1, endCol: 2 },
    }
    const shifted = makeDrag({ selection, isWholeColumnSelection: () => true })
    shifted.drag.tryStart({ x: 350, y: 10, shiftKey: true, button: 0 })
    expect(shifted.selectWholeColumnRange).toHaveBeenLastCalledWith(1, 4)
  })

  it('blocked 或未命中时不消费 pointerdown', () => {
    expect(makeDrag({ blocked: true }).drag.tryStart({
      x: 150, y: 10, shiftKey: false, button: 0,
    })).toBe(false)
    expect(makeDrag({ hitTestGroupHeader: () => null }).drag.tryStart({
      x: 150, y: 10, shiftKey: false, button: 0,
    })).toBe(false)
  })

  it('move 请求自动滚动，reevaluate 重算目标，commit/cancel 停止滚动', () => {
    const first = makeDrag()
    first.drag.tryStart({ x: 150, y: 10, shiftKey: false, button: 0 })
    first.drag.move({ x: 350, y: 200, shiftKey: false })
    expect(first.requestAutoScroll).toHaveBeenCalledTimes(1)
    first.drag.reevaluate({ x: 150, y: 240, shiftKey: false })
    expect(first.selectWholeColumnRange).toHaveBeenLastCalledWith(1, 2)
    first.drag.commit()
    expect(first.stopAutoScroll).toHaveBeenCalledTimes(1)

    const second = makeDrag()
    second.drag.tryStart({ x: 150, y: 10, shiftKey: false, button: 0 })
    second.drag.cancel()
    expect(second.stopAutoScroll).toHaveBeenCalledTimes(1)
  })
})
