import { describe, expect, it, mock } from 'bun:test'
import { ResizeDrag } from '../../../../src/dom/interaction/drag/ResizeDrag'
import type { DomHandleLayer } from '../../../../src/dom/interaction/DomHandleLayer'
import type { ResizeHandleRect } from '@novasheet/core'
import { makeMockGridEngine } from '../../../helpers/mock-grid-engine'

describe('ResizeDrag', () => {
  it('previews column resize and commits on matching pointerup', () => {
    const engine = makeMockGridEngine({ colWidth: 100 })
    const handleLayer = makeHandleLayer()
    const afterEngineMutation = mock(() => {})
    const drag = new ResizeDrag({ engine, handleLayer, afterEngineMutation })
    const handle: ResizeHandleRect = {
      kind: 'column',
      id: 'name',
      fieldId: 'field-0',
      colIndex: 0,
      x: 92,
      y: 0,
      width: 8,
      height: 32,
    }

    expect(drag.start(handle, 1, 100, 0)).toBe(true)
    expect(engine.commitColumnResize).not.toHaveBeenCalled()
    expect(handleLayer.showIndicator).toHaveBeenCalledWith({ kind: 'column', x: 96 })

    expect(drag.movePointer(1, 130, 0)).toBe(true)
    expect(handleLayer.showIndicator).toHaveBeenLastCalledWith({ kind: 'column', x: 126 })

    expect(drag.commitPointer(1)).toBe(true)
    expect(engine.commitColumnResize).toHaveBeenCalledWith(0, 100, 130)
    expect(handleLayer.hideIndicator).toHaveBeenCalled()
    expect(afterEngineMutation).toHaveBeenCalled()
  })
})

function makeHandleLayer(): DomHandleLayer {
  return {
    showIndicator: mock((_line: { kind: 'column'; x: number } | { kind: 'row'; y: number }) => {}),
    hideIndicator: mock(() => {}),
    sync: mock(() => {}),
  } as unknown as DomHandleLayer
}
