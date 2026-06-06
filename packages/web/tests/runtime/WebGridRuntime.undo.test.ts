import { describe, expect, it, mock, spyOn } from 'bun:test'
import {
  DefaultGridEngine,
  InMemoryDataSource,
  type Schema,
  type UndoCommand,
} from '@novasheet/core'
import type { WebHost } from '@novasheet/core'
import type { RenderBackend } from '@novasheet/core'
import { WebGridRuntime } from '../../src/runtime/WebGridRuntime'

const schema: Schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text', width: 80 },
    { id: 'b', name: 'B', type: 'number', width: 80 },
  ],
}

function makeHost(): WebHost {
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
  }
}

function makeRenderer(): RenderBackend {
  return {
    mount: mock(() => {}),
    resize: mock(() => {}),
    render: mock(() => {}),
    destroy: mock(() => {}),
  }
}

function setup() {
  const data = new InMemoryDataSource({
    schema,
    rows: [
      { a: 'x', b: 1 },
      { a: 'y', b: 2 },
    ],
  })
  const engine = new DefaultGridEngine({ data })
  const host = makeHost()
  const renderer = makeRenderer()
  const runtime = new WebGridRuntime({ engine, host, renderer })
  return { engine, runtime, data, host, renderer }
}

describe('WebGridRuntime — undo/redo + events', () => {
  it('runtime.canUndo / canRedo 委派 engine', () => {
    const { engine, runtime } = setup()
    expect(runtime.canUndo()).toBe(false)
    engine.commitRowResize(0, 24, 50)
    expect(runtime.canUndo()).toBe(true)
  })

  it('runtime.undo() 调用 engine.undo + 触发 onUndo 事件', () => {
    const { engine, runtime } = setup()
    engine.commitRowResize(0, 24, 50)
    const events: UndoCommand[] = []
    runtime.setOnUndo((e) => events.push(e.command))
    runtime.undo()
    expect(events.length).toBe(1)
    expect(events[0]?.kind).toBe('resizeRow')
    // 验证 axis 被 engine.undo 实际还原
    expect(engine.getRowsAxis().getSize(0)).toBe(24)
  })

  it('runtime.redo() 触发 onRedo 事件', () => {
    const { engine, runtime } = setup()
    engine.commitRowResize(0, 24, 50)
    runtime.undo()
    const events: UndoCommand[] = []
    runtime.setOnRedo((e) => events.push(e.command))
    runtime.redo()
    expect(events.length).toBe(1)
    expect(events[0]?.kind).toBe('resizeRow')
    expect(engine.getRowsAxis().getSize(0)).toBe(50)
  })

  it('runtime.undo() 在空栈不发事件', () => {
    const { runtime } = setup()
    const events: UndoCommand[] = []
    runtime.setOnUndo((e) => events.push(e.command))
    runtime.undo()
    expect(events.length).toBe(0)
  })

  it('runtime.redo() 在空栈不发事件', () => {
    const { runtime } = setup()
    const events: UndoCommand[] = []
    runtime.setOnRedo((e) => events.push(e.command))
    runtime.redo()
    expect(events.length).toBe(0)
  })

  it('runtime.undo() 触发 afterEngineMutation 副作用链(host.setScrollSize + runtime.refresh)', () => {
    const { engine, runtime, host } = setup()
    engine.commitRowResize(0, 24, 50)
    type MockFn = { mock: { calls: unknown[] } }
    const setScrollSizeBefore = (host.setScrollSize as unknown as MockFn).mock.calls.length
    const refreshSpy = spyOn(runtime, 'refresh')
    runtime.undo()
    const setScrollSizeAfter = (host.setScrollSize as unknown as MockFn).mock.calls.length
    expect(setScrollSizeAfter).toBeGreaterThan(setScrollSizeBefore)
    expect(refreshSpy).toHaveBeenCalled()
  })
})

describe('WebGridRuntime — keyboard routing', () => {
  it('Cmd+Z 在 canUndo 时返回 true 并 undo', () => {
    const { engine, runtime } = setup()
    engine.commitRowResize(0, 24, 50)
    const handled = runtime.handleHostKeyDown({
      key: 'z',
      shiftKey: false,
      ctrlKey: false,
      metaKey: true,
      altKey: false,
    })
    expect(handled).toBe(true)
    expect(engine.getRowsAxis().getSize(0)).toBe(24)
  })

  it('Ctrl+Z 在 canUndo 时返回 true 并 undo', () => {
    const { engine, runtime } = setup()
    engine.commitRowResize(0, 24, 50)
    const handled = runtime.handleHostKeyDown({
      key: 'z',
      shiftKey: false,
      ctrlKey: true,
      metaKey: false,
      altKey: false,
    })
    expect(handled).toBe(true)
  })

  it('Cmd+Z 在空栈时返回 false(不 preventDefault)', () => {
    const { runtime } = setup()
    const handled = runtime.handleHostKeyDown({
      key: 'z',
      shiftKey: false,
      ctrlKey: false,
      metaKey: true,
      altKey: false,
    })
    expect(handled).toBe(false)
  })

  it('Cmd+Shift+Z 在 canRedo 时 redo', () => {
    const { engine, runtime } = setup()
    engine.commitRowResize(0, 24, 50)
    runtime.undo()
    const handled = runtime.handleHostKeyDown({
      key: 'z',
      shiftKey: true,
      ctrlKey: false,
      metaKey: true,
      altKey: false,
    })
    expect(handled).toBe(true)
    expect(engine.getRowsAxis().getSize(0)).toBe(50)
  })

  it('Ctrl+Y 在 canRedo 时 redo(Windows 风格)', () => {
    const { engine, runtime } = setup()
    engine.commitRowResize(0, 24, 50)
    runtime.undo()
    const handled = runtime.handleHostKeyDown({
      key: 'y',
      shiftKey: false,
      ctrlKey: true,
      metaKey: false,
      altKey: false,
    })
    expect(handled).toBe(true)
    expect(engine.getRowsAxis().getSize(0)).toBe(50)
  })

  it('编辑中按 Cmd+Z 不被拦截(handleHostKeyDown 在 isCellEditing 时 short-circuit)', () => {
    const { engine, runtime } = setup()
    engine.commitRowResize(0, 24, 50)
    engine.selectCell({ rowIndex: 0, colIndex: 0 })
    engine.beginCellEdit({ rowIndex: 0, colIndex: 0 })
    const handled = runtime.handleHostKeyDown({
      key: 'z',
      shiftKey: false,
      ctrlKey: false,
      metaKey: true,
      altKey: false,
    })
    expect(handled).toBe(false)
    // engine 未受影响,resize 仍生效
    expect(engine.getRowsAxis().getSize(0)).toBe(50)
  })
})

describe('WebGridRuntime — resize via commit* APIs', () => {
  it('engine.commitRowResize 直调走 undo 栈', () => {
    const { engine, runtime } = setup()
    const before = engine.getRowsAxis().getSize(0)
    engine.commitRowResize(0, before, 100)
    expect(engine.getRowsAxis().getSize(0)).toBe(100)
    runtime.undo()
    expect(engine.getRowsAxis().getSize(0)).toBe(before)
  })

  it('engine.commitColumnResize 直调走 undo 栈', () => {
    const { engine, runtime } = setup()
    const before = engine.getColsAxis().getSize(0)
    engine.commitColumnResize(0, before, 200)
    runtime.undo()
    expect(engine.getColsAxis().getSize(0)).toBe(before)
  })
})

describe('WebGridRuntime — paste undo integration', () => {
  it('engine.commitPaste 走 undo 栈,runtime.undo 还原 + 选区设回 target', () => {
    const { engine, runtime } = setup()
    engine.selectCell({ rowIndex: 0, colIndex: 0 })
    engine.commitPaste(
      { cells: [['p', 99]], sourceFieldIds: ['a', 'b'], typed: false },
      { startRow: 0, endRow: 0, startCol: 0, endCol: 1, tile: { rows: 1, cols: 1 } },
      ['a', 'b'],
    )
    expect(engine.getData().getCell(0, 'a')).toBe('p')
    expect(engine.getData().getCell(0, 'b')).toBe(99)
    runtime.undo()
    expect(engine.getData().getCell(0, 'a')).toBe('x')
    expect(engine.getData().getCell(0, 'b')).toBe(1)
    const sel = engine.getSelection()
    expect(sel.selectedRange).toEqual({
      startRow: 0,
      endRow: 0,
      startCol: 0,
      endCol: 1,
    })
  })
})
