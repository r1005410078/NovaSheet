import { describe, expect, it, mock } from 'bun:test'
import { FillHandleDrag } from '../../../../src/dom/interaction/drag/FillHandleDrag'
import type { DomFillHandleLayer } from '../../../../src/dom/interaction/DomFillHandleLayer'
import type { OverlayRect } from '../../../../src/dom/overlay/RangeOverlayRects'
import type { WebHost, WebPointerEvent } from '@zhiguang/core'
import { makeMockGridEngine } from '../../../helpers/mock-grid-engine'

describe('FillHandleDrag', () => {
  it('uses host-local pointer coordinates to preview, commit, and emit fill', () => {
    const engine = makeMockGridEngine({
      selection: {
        activeCell: { rowIndex: 0, colIndex: 0 },
        anchorCell: { rowIndex: 0, colIndex: 0 },
        extentCell: { rowIndex: 1, colIndex: 1 },
        selectedRange: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
      },
    })
    const fillLayer = makeFillLayer()
    const afterEngineMutation = mock(() => {})
    const onFill = mock(() => {})
    const drag = new FillHandleDrag({
      engine,
      host: makeHost({ left: 100, top: 80 }),
      fillLayer,
      afterEngineMutation,
      autofitRows: mock(() => ({ changedRows: 0, skippedRows: 0 })),
      onFill,
      closeContextMenu: mock(() => {}),
      commitCellEdit: mock(() => {}),
      requestAutoScroll: mock((_pointer: WebPointerEvent) => {}),
      stopAutoScroll: mock(() => {}),
      isBlocked: () => false,
    })

    expect(drag.tryStartFromClient(1, 250, 170)).toBe(true)
    expect(drag.moveFromClient(1, 250, 230)).toBe(true)
    expect(drag.commitPointer(1)).toBe(true)

    expect(fillLayer.showPreview).toHaveBeenCalled()
    expect(engine.commitFill).toHaveBeenCalled()
    expect(afterEngineMutation).toHaveBeenCalled()
    expect(onFill).toHaveBeenCalledWith({
      source: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
      fill: { startRow: 2, endRow: 3, startCol: 0, endCol: 1 },
      result: { startRow: 0, endRow: 3, startCol: 0, endCol: 1 },
      direction: 'down',
    })
  })
})

function makeFillLayer() {
  return {
    sync: mock((_rect: OverlayRect | null) => {}),
    showPreview: mock((_rects: readonly OverlayRect[]) => {}),
    hidePreview: mock(() => {}),
  } as unknown as DomFillHandleLayer
}

function makeHost(offset: { left: number; top: number }): WebHost {
  return {
    getContainerBoundingRect: () => offset,
  } as unknown as WebHost
}
