import { describe, expect, it, mock } from 'bun:test'
import { createSheetContext, type DataSource, type Row, type Schema } from '@novasheet/core'
import { WebGridRuntime, type WebHost, type WebRenderer } from '@novasheet/web'
import { installContextMenuFeature } from '@novasheet/feature-context-menu'
import { installClipboardFeature } from '../src'
import { makeMockGridEngine } from './helpers/mock-grid-engine'

const SCHEMA: Schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text', width: 100 },
    { id: 'b', name: 'B', type: 'number', width: 100 },
  ],
}

function stubClipboard(initial = ''): { store: { text: string } } {
  const store = { text: initial }
  Object.defineProperty(navigator, 'clipboard', {
    value: {
      writeText: (t: string) => {
        store.text = t
        return Promise.resolve()
      },
      readText: () => Promise.resolve(store.text),
    },
    configurable: true,
    writable: true,
  })
  return { store }
}

function makeEngine() {
  const rows = [{ a: 'x', b: 1 }] as Row[]
  const data = {
    getRowCount: () => 1,
    getSchema: () => SCHEMA,
    getRows: () => rows,
    getCell: (r: number, f: string) => (rows[r] as Record<string, unknown> | undefined)?.[f] ?? null,
    subscribe: () => () => {},
    updateCell: () => {},
  } as unknown as DataSource
  const engine = makeMockGridEngine({
    data,
    selection: {
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 0, colIndex: 0 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
    },
  })
  engine.clearRange = mock(() => {})
  return engine
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
    container: document.createElement('div'),
  }
}

function makeRenderer(): WebRenderer {
  return { mount: mock(() => {}), resize: mock(() => {}), render: mock(() => {}), destroy: mock(() => {}) }
}

function makeRuntime(engine = makeEngine()) {
  const ctx = createSheetContext()
  installClipboardFeature(ctx)
  installContextMenuFeature(ctx)
  return new WebGridRuntime({ engine, context: ctx, host: makeHost(), renderer: makeRenderer() })
}

function openCellMenu(runtime: WebGridRuntime): void {
  runtime.handleHostContextMenu({ x: 50, y: 60, shiftKey: false, clientX: 50, clientY: 60 })
}

const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {}) => ({
  key: k,
  ctrlKey: mods.ctrlKey ?? false,
  metaKey: mods.metaKey ?? false,
  shiftKey: mods.shiftKey ?? false,
  altKey: false,
})

describe('WebGridRuntime × clipboard feature — 键盘入口', () => {
  it('Ctrl+C 触发 copy（写 TSV）', async () => {
    const { store } = stubClipboard()
    const runtime = makeRuntime()
    expect(runtime.handleHostKeyDown(key('c', { ctrlKey: true }))).toBe(true)
    await Promise.resolve()
    await Promise.resolve()
    expect(store.text).toBe('x')
    runtime.destroy()
  })

  it('Cmd+C 等价 Ctrl+C', async () => {
    const { store } = stubClipboard()
    const runtime = makeRuntime()
    runtime.handleHostKeyDown(key('c', { metaKey: true }))
    await Promise.resolve()
    await Promise.resolve()
    expect(store.text).toBe('x')
    runtime.destroy()
  })

  it('Ctrl+X 触发 cut（清原格）', async () => {
    stubClipboard()
    const engine = makeEngine()
    const runtime = makeRuntime(engine)
    runtime.handleHostKeyDown(key('x', { ctrlKey: true }))
    await Promise.resolve()
    await Promise.resolve()
    expect(engine.clearRange).toHaveBeenCalled()
    runtime.destroy()
  })

  it('Ctrl+V 触发 paste（经 engine.commitPaste）', async () => {
    stubClipboard('pasted\t9')
    const engine = makeEngine()
    engine.commitPaste = mock(() => {})
    const runtime = makeRuntime(engine)
    runtime.handleHostKeyDown(key('v', { ctrlKey: true }))
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(engine.commitPaste).toHaveBeenCalled()
    runtime.destroy()
  })

  it('编辑中 Ctrl+C 不被拦截（让浏览器原生剪贴板接管）', () => {
    stubClipboard()
    const engine = makeEngine()
    engine.isCellEditing = mock(() => true)
    const runtime = makeRuntime(engine)
    expect(runtime.handleHostKeyDown(key('c', { ctrlKey: true }))).toBe(false)
    runtime.destroy()
  })

  it('Shift+Ctrl+C 不触发剪贴板', () => {
    const { store } = stubClipboard()
    const runtime = makeRuntime()
    expect(runtime.handleHostKeyDown(key('c', { ctrlKey: true, shiftKey: true }))).toBe(false)
    expect(store.text).toBe('')
    runtime.destroy()
  })
})

describe('WebGridRuntime × clipboard feature — 右键菜单入口', () => {
  it('菜单 copy 走 grid copy（写 TSV）', async () => {
    const { store } = stubClipboard()
    const runtime = makeRuntime()
    openCellMenu(runtime)
    runtime.handleContextMenuSelected('copy')
    await Promise.resolve()
    await Promise.resolve()
    expect(store.text).toBe('x')
    runtime.destroy()
  })

  it('菜单 cut 走 grid cut（清原格）', async () => {
    stubClipboard()
    const engine = makeEngine()
    const runtime = makeRuntime(engine)
    openCellMenu(runtime)
    runtime.handleContextMenuSelected('cut')
    await Promise.resolve()
    await Promise.resolve()
    expect(engine.clearRange).toHaveBeenCalled()
    runtime.destroy()
  })
})
