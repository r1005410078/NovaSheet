import { describe, expect, it, mock, spyOn } from 'bun:test'
import {
  DefaultGridEngine,
  InMemoryDataSource,
  type Schema,
  type UndoCommand,
} from '@novasheet/core'
import type { WebHost } from '../../src/host/WebHost'
import type { WebRenderer } from '../../src/render/WebRenderer'
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
    scrollTo: mock(() => {}),
    getDpr: () => 1,
    getContainerSize: () => ({ width: 400, height: 300 }),
    getContainerBoundingRect: () => ({ left: 0, top: 0 }),
    getScrollPosition: () => ({ scrollTop: 0, scrollLeft: 0 }),
    focusScrollHost: mock(() => {}),
    destroy: mock(() => {}),
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
