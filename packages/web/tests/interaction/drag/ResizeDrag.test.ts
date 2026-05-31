import { describe, expect, it, mock } from 'bun:test'
import type { GridEngine, Theme } from '@novasheet/core'
import { ResizeDrag } from '../../../src/interaction/drag/ResizeDrag'
import type { DomHandleLayer } from '../../../src/interaction/DomHandleLayer'
import type { ResizeHandleRect } from '@novasheet/core'

describe('ResizeDrag', () => {
  it('previews column resize and commits on matching pointerup', () => {
    const engine = makeEngine()
    const handleLayer = makeHandleLayer()
    const afterEngineMutation = mock(() => {})
    const drag = new ResizeDrag({ engine, handleLayer, afterEngineMutation })
    const handle: ResizeHandleRect = {
      kind: 'column',
      id: 'name',
      fieldId: 'name',
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

function makeEngine(): GridEngine {
  return {
    getColumnIndex: mock(() => 0),
    getColsAxis: () =>
      ({
        getSize: () => 100,
      }) as never,
    getRowsAxis: () =>
      ({
        getCount: () => 10,
        getSize: () => 30,
      }) as never,
    getTheme: () => ({ metrics: { headerHeight: 30 } }) as Theme,
    commitColumnResize: mock(() => {}),
    commitRowResize: mock(() => {}),
  } as unknown as GridEngine
}

function makeHandleLayer(): DomHandleLayer {
  return {
    showIndicator: mock((_line: { kind: 'column'; x: number } | { kind: 'row'; y: number }) => {}),
    hideIndicator: mock(() => {}),
    sync: mock(() => {}),
  } as unknown as DomHandleLayer
}
