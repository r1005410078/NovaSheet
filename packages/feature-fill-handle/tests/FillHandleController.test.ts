import { describe, expect, it, mock } from 'bun:test'
import type { RenderFrame } from '@novasheet/core'
import type { WebHost, WebInteractionStatus } from '@novasheet/web'
import { FillHandleController, type FillHandleControllerDeps } from '../src'
import { makeMockGridEngine } from './helpers/mock-grid-engine'

const SELECTION = {
  activeCell: { rowIndex: 0, colIndex: 0 },
  anchorCell: { rowIndex: 0, colIndex: 0 },
  extentCell: { rowIndex: 1, colIndex: 1 },
  selectedRange: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
}

function makeHost(offset = { left: 0, top: 0 }): WebHost {
  return { getContainerBoundingRect: () => offset } as unknown as WebHost
}

function makeDeps(overrides: Partial<FillHandleControllerDeps> = {}): {
  deps: FillHandleControllerDeps
  spies: {
    afterEngineMutation: ReturnType<typeof mock>
    onFill: ReturnType<typeof mock>
    requestAutoScroll: ReturnType<typeof mock>
    commitActiveEdit: ReturnType<typeof mock>
  }
} {
  const spies = {
    afterEngineMutation: mock(() => {}),
    onFill: mock(() => {}),
    requestAutoScroll: mock(() => {}),
    commitActiveEdit: mock(() => {}),
  }
  const deps: FillHandleControllerDeps = {
    engine: makeMockGridEngine({ selection: SELECTION }),
    host: makeHost(),
    afterEngineMutation: spies.afterEngineMutation,
    autofitRows: mock(() => ({ changedRows: 0, skippedRows: 0 })),
    onFill: spies.onFill,
    closeContextMenu: mock(() => {}),
    commitActiveEdit: spies.commitActiveEdit,
    requestAutoScroll: spies.requestAutoScroll,
    stopAutoScroll: mock(() => {}),
    isBlocked: () => false,
    ...overrides,
  }
  return { deps, spies }
}

function handleOf(container: HTMLElement): HTMLElement {
  return container.querySelector('[data-novasheet-fill-handle]') as HTMLElement
}

function dispatchPointer(el: HTMLElement, type: string, init: PointerEventInit): void {
  el.dispatchEvent(new PointerEvent(type, { bubbles: true, ...init }))
}

describe('FillHandleController', () => {
  it('拖拽后通过 engine 提交填充并触发 onFill / afterEngineMutation', () => {
    const { deps, spies } = makeDeps()
    const controller = new FillHandleController(deps)
    const container = document.createElement('div')
    controller.attach(container)
    const handle = handleOf(container)

    dispatchPointer(handle, 'pointerdown', { pointerId: 1, clientX: 150, clientY: 90 })
    dispatchPointer(handle, 'pointermove', { pointerId: 1, clientX: 150, clientY: 150 })
    expect(container.querySelectorAll('[data-novasheet-fill-preview]').length).toBeGreaterThan(0)
    dispatchPointer(handle, 'pointerup', { pointerId: 1 })

    expect(deps.engine.commitFill).toHaveBeenCalled()
    expect(spies.onFill).toHaveBeenCalled()
    expect(spies.afterEngineMutation).toHaveBeenCalled()
    expect(spies.requestAutoScroll).toHaveBeenCalled()
    controller.destroy()
  })

  it('无选区时不进入填充拖拽', () => {
    const engine = makeMockGridEngine({
      selection: { activeCell: null, anchorCell: null, extentCell: null, selectedRange: null },
    })
    const { deps } = makeDeps({ engine })
    const controller = new FillHandleController(deps)
    const container = document.createElement('div')
    controller.attach(container)
    const handle = handleOf(container)

    dispatchPointer(handle, 'pointerdown', { pointerId: 1, clientX: 0, clientY: 0 })
    dispatchPointer(handle, 'pointermove', { pointerId: 1, clientX: 0, clientY: 150 })
    dispatchPointer(handle, 'pointerup', { pointerId: 1 })

    expect(deps.engine.commitFill).not.toHaveBeenCalled()
    controller.destroy()
  })

  it('isBlocked 时不进入填充拖拽', () => {
    const { deps } = makeDeps({ isBlocked: () => true })
    const controller = new FillHandleController(deps)
    const container = document.createElement('div')
    controller.attach(container)
    const handle = handleOf(container)

    dispatchPointer(handle, 'pointerdown', { pointerId: 1, clientX: 150, clientY: 90 })
    dispatchPointer(handle, 'pointermove', { pointerId: 1, clientX: 150, clientY: 150 })
    dispatchPointer(handle, 'pointerup', { pointerId: 1 })

    expect(deps.engine.commitFill).not.toHaveBeenCalled()
    controller.destroy()
  })

  it('编辑中起拖会先提交进行中的编辑', () => {
    const engine = makeMockGridEngine({ selection: SELECTION })
    engine.isCellEditing = mock(() => true)
    const { deps, spies } = makeDeps({ engine })
    const controller = new FillHandleController(deps)
    const container = document.createElement('div')
    controller.attach(container)

    dispatchPointer(handleOf(container), 'pointerdown', { pointerId: 1, clientX: 150, clientY: 90 })

    expect(spies.commitActiveEdit).toHaveBeenCalledWith(false)
    controller.destroy()
  })

  describe('syncFrame', () => {
    function makeFrame(selectedRange: unknown): RenderFrame {
      return {
        rowsAxis: { indexToPosition: (i: number) => i * 30, getSize: () => 30 },
        colsAxis: { indexToPosition: (i: number) => i * 100, getSize: () => 100 },
        viewport: {
          regions: [
            {
              rowRange: [0, 9],
              colRange: [0, 3],
              rect: { x: 0, y: 30, width: 400, height: 270 },
              scrollOffsetX: 0,
              scrollOffsetY: 0,
            },
          ],
        },
        mergeRegions: undefined,
        selection: { selectedRange, activeCell: null },
      } as unknown as RenderFrame
    }

    const idle: WebInteractionStatus = { interacting: false, editing: false }

    it('选区存在且空闲时显示手柄', () => {
      const { deps } = makeDeps()
      const controller = new FillHandleController(deps)
      const container = document.createElement('div')
      controller.attach(container)
      controller.syncFrame(makeFrame({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }), idle)
      expect(handleOf(container).style.display).toBe('block')
      controller.destroy()
    })

    it('交互或编辑中隐藏手柄', () => {
      const { deps } = makeDeps()
      const controller = new FillHandleController(deps)
      const container = document.createElement('div')
      controller.attach(container)
      const frame = makeFrame({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 })
      controller.syncFrame(frame, { interacting: true, editing: false })
      expect(handleOf(container).style.display).toBe('none')
      controller.syncFrame(frame, { interacting: false, editing: true })
      expect(handleOf(container).style.display).toBe('none')
      controller.destroy()
    })

    it('无选区时隐藏手柄', () => {
      const { deps } = makeDeps()
      const controller = new FillHandleController(deps)
      const container = document.createElement('div')
      controller.attach(container)
      controller.syncFrame(makeFrame(null), idle)
      expect(handleOf(container).style.display).toBe('none')
      controller.destroy()
    })
  })
})
