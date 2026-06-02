import { describe, expect, it, mock } from 'bun:test'
import { createSheetContext, denseGridTheme, type DataSource, type GridEngine } from '@novasheet/core'
import { WebGridRuntime, type WebHost, type WebRenderer } from '@novasheet/web'
import { installFillHandleFeature } from '../src'
import { makeMockGridEngine } from './helpers/mock-grid-engine'

const SELECTION = {
  activeCell: { rowIndex: 0, colIndex: 0 },
  anchorCell: { rowIndex: 0, colIndex: 0 },
  extentCell: { rowIndex: 1, colIndex: 1 },
  selectedRange: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
}

function makeContext() {
  const ctx = createSheetContext()
  installFillHandleFeature(ctx)
  return ctx
}

function makeEngine(): GridEngine {
  return makeMockGridEngine({
    selection: SELECTION,
    rowHeight: 30,
    colWidth: 100,
    theme: {
      ...denseGridTheme,
      metrics: { ...denseGridTheme.metrics, headerHeight: 30, rowHeight: 30 },
    },
  })
}

function makeHost(container: HTMLElement): WebHost {
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
    container,
  }
}

function makeRenderer(): WebRenderer {
  return {
    mount: mock(() => {}),
    resize: mock(() => {}),
    render: mock(() => {}),
    destroy: mock(() => {}),
  }
}

function handleOf(container: HTMLElement): HTMLElement {
  return container.querySelector('[data-novasheet-fill-handle]') as HTMLElement
}

function dispatchPointer(el: HTMLElement, type: string, init: PointerEventInit): void {
  el.dispatchEvent(new PointerEvent(type, { bubbles: true, ...init }))
}

describe('WebGridRuntime × fill-handle feature', () => {
  it('安装后填充拖拽经 layer 提交 engine.commitFill 并触发 onFill', () => {
    const engine = makeEngine()
    const container = document.createElement('div')
    const runtime = new WebGridRuntime({
      engine,
      context: makeContext(),
      host: makeHost(container),
      renderer: makeRenderer(),
    })
    const onFill = mock(() => {})
    runtime.setOnFill(onFill)

    const handle = handleOf(container)
    dispatchPointer(handle, 'pointerdown', { pointerId: 1, clientX: 150, clientY: 90 })
    dispatchPointer(handle, 'pointermove', { pointerId: 1, clientX: 150, clientY: 150 })
    dispatchPointer(handle, 'pointerup', { pointerId: 1 })

    expect(engine.commitFill).toHaveBeenCalled()
    expect(onFill).toHaveBeenCalled()
    runtime.destroy()
  })

  it('未安装 fill feature 时无填充柄、flush 不 crash', () => {
    const container = document.createElement('div')
    const runtime = new WebGridRuntime({
      engine: makeEngine(),
      context: createSheetContext(),
      host: makeHost(container),
      renderer: makeRenderer(),
    })
    expect(container.querySelector('[data-novasheet-fill-handle]')).toBeNull()
    expect(() => runtime.paintNow()).not.toThrow()
    runtime.destroy()
  })

  it('填充换行文本的行经 runtime autofit 增高', () => {
    const engine = makeEngine()
    const data = {
      getRowCount: () => 10,
      getSchema: () => ({
        fields: [
          { id: 'a', name: 'A', type: 'text', width: 44, wrap: true },
          { id: 'b', name: 'B', type: 'number', width: 100 },
        ],
      }),
      getRows: () => [],
      getCell: (rowIndex: number, fieldId: string) =>
        rowIndex === 2 && fieldId === 'a' ? 'filled text needs several wrapped lines' : null,
      subscribe: () => () => {},
    } as unknown as DataSource
    engine.getData = mock(() => data)
    ;(engine.getFrame() as { data: DataSource }).data = data
    engine.commitFill = mock((source, fill) => ({
      source,
      fill,
      result: { startRow: 0, endRow: 2, startCol: 0, endCol: 0 },
      writes: [{ rowIndex: 2, fieldId: 'a', value: 'filled text needs several wrapped lines' }],
    }))
    const container = document.createElement('div')
    const runtime = new WebGridRuntime({
      engine,
      context: makeContext(),
      host: makeHost(container),
      renderer: makeRenderer(),
      measurer: { measureWidth: (text) => text.length * 7 },
    })

    const handle = handleOf(container)
    dispatchPointer(handle, 'pointerdown', { pointerId: 1, clientX: 50, clientY: 45 })
    dispatchPointer(handle, 'pointermove', { pointerId: 1, clientX: 50, clientY: 90 })
    dispatchPointer(handle, 'pointerup', { pointerId: 1 })

    expect(engine.setRowHeight).toHaveBeenCalledWith(2, expect.any(Number))
    expect((engine.setRowHeight as ReturnType<typeof mock>).mock.calls[0]?.[1]).toBeGreaterThan(
      denseGridTheme.metrics.rowHeight,
    )
    runtime.destroy()
  })
})
