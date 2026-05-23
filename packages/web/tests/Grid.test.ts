import { describe, expect, it, mock, spyOn } from 'bun:test'
import {
  InMemoryDataSource,
  denseGridTheme,
  type CellAddress,
  type DataSource,
  type GridSelection,
  type Schema,
} from '@novasheet/core'
import { Grid } from '../src/Grid'

const SCHEMA: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 200 },
    { id: 'age', name: 'Age', type: 'number', width: 80 },
  ],
}

function makeData() {
  return new InMemoryDataSource({
    schema: SCHEMA,
    rows: Array.from({ length: 50 }, (_, i) => ({ name: `n${i}`, age: i })),
  })
}

/** Reach Canvas2DBackend internals (facade hides delegate). */
function canvas2dDelegate(grid: Grid) {
  return (
    grid as unknown as {
      delegate: {
        runtime: { refresh: () => void; viewPipeline?: unknown }
        engine: {
          beginCellEdit: (cell: CellAddress) => boolean
          updateCellEditDraft: (draft: string) => void
          commitCellEdit: () => boolean
          selectCell: (cell: CellAddress) => void
          getSelection: () => GridSelection
          getFrame: () => {
            viewport: {
              regions: Array<{ id: string; scrollOffsetX: number }>
              quadrants: {
                topLeft?: unknown
                topRight?: unknown
                bottomLeft?: unknown
              }
            }
          }
          getViewport: () => {
            setScroll: (x: number, y: number) => void
            setSize: (w: number, h: number) => void
          }
          getData: () => DataSource
        }
        highDpi: { resize: (w: number, h: number) => void }
        getViewPipeline: () => unknown
      }
    }
  ).delegate
}

function runtimeRefreshSpy(grid: Grid) {
  return spyOn(canvas2dDelegate(grid).runtime, 'refresh')
}

describe('Grid — 浏览器门面', () => {
  it('在容器内挂载 canvas', () => {
    const el = document.createElement('div')
    Object.assign(el.style, { width: '400px', height: '300px' })
    document.body.appendChild(el)
    const grid = new Grid(el, { data: makeData() })
    expect(el.querySelector('canvas')).not.toBeNull()
    grid.destroy()
    document.body.removeChild(el)
  })

  it('destroy 幂等并移除 canvas', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    grid.destroy()
    grid.destroy()
    expect(el.querySelector('canvas')).toBeNull()
  })

  it('mount → destroy → mount 可重复（Strict Mode 形态）', () => {
    const el = document.createElement('div')
    const data = makeData()
    const g1 = new Grid(el, { data })
    g1.destroy()
    const g2 = new Grid(el, { data })
    expect(el.querySelectorAll('canvas')).toHaveLength(1)
    g2.destroy()
  })

  it('setTheme 触发重绘', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    const spy = runtimeRefreshSpy(grid)
    grid.setTheme(denseGridTheme)
    expect(spy).toHaveBeenCalled()
    grid.destroy()
  })

  it('setData 替换数据源并触发重绘', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    const newData = new InMemoryDataSource({ schema: SCHEMA, rows: [{ name: 'X', age: 0 }] })
    grid.setData(newData)
    expect(el.querySelector('canvas')).not.toBeNull()
    grid.destroy()
  })

  it('setRowHeight 改行高并触发重绘', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    const spy = runtimeRefreshSpy(grid)
    grid.setRowHeight(5, 60)
    expect(spy).toHaveBeenCalled()
    grid.destroy()
  })

  it('setColumnWidth 改列宽并触发重绘', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    const spy = runtimeRefreshSpy(grid)
    grid.setColumnWidth('age', 200)
    expect(spy).toHaveBeenCalled()
    grid.destroy()
  })

  it('未知 fieldId 的 setColumnWidth 为 no-op', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    grid.setColumnWidth('does-not-exist', 200)
    grid.destroy()
  })

  it('destroy 取消 pending 的 renderer flush', () => {
    const rafs: Array<() => void> = []
    const originalRaf = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = ((cb: () => void) => {
      rafs.push(cb)
      return rafs.length
    }) as typeof requestAnimationFrame

    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    while (rafs.length) rafs.shift()!()
    grid.refresh()
    expect(rafs).toHaveLength(1)
    grid.destroy()
    rafs[0]!()

    globalThis.requestAnimationFrame = originalRaf
  })

  it('destroy 恢复容器原始 position', () => {
    const el = document.createElement('div')
    el.style.position = 'absolute'
    const grid = new Grid(el, { data: makeData() })
    expect(el.style.position).toBe('absolute')
    grid.destroy()
    expect(el.style.position).toBe('absolute')
  })

  it('挂载 scroll-host、scroll-spacer 与 canvas，DOM 层级正确', () => {
    const el = document.createElement('div')
    Object.assign(el.style, { width: '400px', height: '300px' })
    document.body.appendChild(el)
    const grid = new Grid(el, { data: makeData() })

    const scrollHost = el.querySelector('[data-novasheet-scroll-host]') as HTMLElement | null
    const spacer = el.querySelector('[data-novasheet-scroll-spacer]') as HTMLElement | null
    const canvas = el.querySelector('canvas') as HTMLCanvasElement | null

    expect(scrollHost).not.toBeNull()
    expect(spacer).not.toBeNull()
    expect(canvas).not.toBeNull()
    expect(scrollHost!.contains(spacer!)).toBe(true)
    expect(scrollHost!.parentNode).toBe(el)
    expect(canvas!.parentNode).toBe(el)

    grid.destroy()
    document.body.removeChild(el)
  })

  it('canvas 为 pointer-events:none，滚动事件穿透', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    const canvas = el.querySelector('canvas') as HTMLCanvasElement
    expect(canvas.style.pointerEvents).toBe('none')
    grid.destroy()
  })

  it('scroll-host 为 overflow:auto，产生原生滚动条', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    const host = el.querySelector('[data-novasheet-scroll-host]') as HTMLElement
    expect(host.style.overflow).toBe('auto')
    grid.destroy()
  })

  it('scroll-host 应用 Theme scrollbar CSS 变量', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    const host = el.querySelector('[data-novasheet-scroll-host]') as HTMLElement
    expect(host.style.getPropertyValue('--ns-scrollbar-size')).toBe('10px')
    expect(host.style.getPropertyValue('--ns-scrollbar-thumb')).toBe(
      'rgba(31, 35, 40, 0.28)',
    )
    grid.destroy()
  })

  it('scroll-host z-index 高于 canvas，原生滚动条可见', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    const host = el.querySelector('[data-novasheet-scroll-host]') as HTMLElement
    const canvas = el.querySelector('canvas') as HTMLCanvasElement
    expect(Number(host.style.zIndex)).toBeGreaterThan(Number(canvas.style.zIndex))
    grid.destroy()
  })

  it('scroll-spacer 宽高由 ScrollMapper.computeSpacerSize 决定', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    const spacer = el.querySelector('[data-novasheet-scroll-spacer]') as HTMLElement
    expect(spacer.style.height).toBe('1432px')
    expect(spacer.style.width).toBe('280px')
    grid.destroy()
  })

  it('setColumnWidth 会更新 spacer 宽度', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    grid.setColumnWidth('name', 500)
    const spacer = el.querySelector('[data-novasheet-scroll-spacer]') as HTMLElement
    expect(spacer.style.width).toBe(`${280 + 300}px`)
    grid.destroy()
  })

  it('setFrozen 更新冻结区域并触发重绘', () => {
    const el = document.createElement('div')
    Object.assign(el.style, { width: '400px', height: '300px' })
    document.body.appendChild(el)
    const grid = new Grid(el, { data: makeData() })
    const spy = runtimeRefreshSpy(grid)

    grid.setFrozen(1, 1)

    const quadrants = canvas2dDelegate(grid).engine.getFrame().viewport.quadrants
    expect(quadrants.topLeft).toBeDefined()
    expect(quadrants.topRight).toBeDefined()
    expect(quadrants.bottomLeft).toBeDefined()
    expect(spy).toHaveBeenCalled()

    grid.destroy()
    document.body.removeChild(el)
  })

  it('setFrozen 支持右侧冻结列配置对象', () => {
    const el = document.createElement('div')
    Object.assign(el.style, { width: '400px', height: '300px' })
    document.body.appendChild(el)
    const grid = new Grid(el, { data: makeData() })
    const spy = runtimeRefreshSpy(grid)

    grid.setFrozen({ topRows: 1, leftCols: 1, rightCols: 1 })

    const regionIds = canvas2dDelegate(grid).engine.getFrame().viewport.regions.map((region) => region.id)
    expect(regionIds).toContain('middleRight')
    expect(regionIds).toContain('topRight')
    expect(spy).toHaveBeenCalled()

    grid.destroy()
    document.body.removeChild(el)
  })

  it('destroy 同时移除 scroll-host 与 canvas', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    grid.destroy()
    expect(el.querySelector('[data-novasheet-scroll-host]')).toBeNull()
    expect(el.querySelector('canvas')).toBeNull()
  })

  it('setData 按新数据集重算 spacer 尺寸', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    const newData = new InMemoryDataSource({
      schema: SCHEMA,
      rows: Array.from({ length: 200 }, (_, i) => ({ name: `n${i}`, age: i })),
    })
    grid.setData(newData)
    const spacer = el.querySelector('[data-novasheet-scroll-spacer]') as HTMLElement
    expect(spacer.style.height).toBe(`${200 * 28 + 32}px`)
    grid.destroy()
  })

  it('setRowHeight 会更新 spacer 高度', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    grid.setRowHeight(0, 100)
    const spacer = el.querySelector('[data-novasheet-scroll-spacer]') as HTMLElement
    expect(spacer.style.height).toBe(`${50 * 28 + 72 + 32}px`)
    grid.destroy()
  })

  it('原生滚动经 ScrollMapper 映射到 viewport', () => {
    const rafs: Array<() => void> = []
    const originalRaf = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = ((cb: () => void) => {
      rafs.push(cb)
      return rafs.length
    }) as typeof requestAnimationFrame

    const el = document.createElement('div')
    Object.assign(el.style, { width: '400px', height: '300px' })
    document.body.appendChild(el)
    const grid = new Grid(el, { data: makeData() })
    const host = el.querySelector('[data-novasheet-scroll-host]') as HTMLElement
    while (rafs.length) rafs.shift()!()

    const viewport = canvas2dDelegate(grid).engine.getViewport()
    const setScrollSpy = spyOn(viewport, 'setScroll')

    Object.defineProperty(host, 'scrollTop', { value: 56, writable: true, configurable: true })
    Object.defineProperty(host, 'scrollLeft', { value: 0, writable: true, configurable: true })
    host.dispatchEvent(new Event('scroll'))
    expect(rafs).toHaveLength(1)
    while (rafs.length) rafs.shift()!()

    expect(setScrollSpy).toHaveBeenCalledTimes(1)
    expect(setScrollSpy).toHaveBeenCalledWith(0, 56)

    grid.destroy()
    document.body.removeChild(el)
    globalThis.requestAnimationFrame = originalRaf
  })

  it('有左冻结列时横向滚动立即推动中心区域', () => {
    const rafs: Array<() => void> = []
    const originalRaf = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = ((cb: () => void) => {
      rafs.push(cb)
      return rafs.length
    }) as typeof requestAnimationFrame

    const el = document.createElement('div')
    Object.assign(el.style, { width: '400px', height: '300px' })
    document.body.appendChild(el)
    const data = new InMemoryDataSource({
      schema: {
        fields: [
          { id: 'name', name: 'Name', type: 'text', width: 100 },
          { id: 'age', name: 'Age', type: 'number', width: 100 },
          { id: 'notes', name: 'Notes', type: 'text', width: 300 },
        ],
      },
      rows: Array.from({ length: 20 }, (_, i) => ({ name: `n${i}`, age: i, notes: `note ${i}` })),
    })
    const grid = new Grid(el, { data, frozen: { leftCols: 1 } })
    const host = el.querySelector('[data-novasheet-scroll-host]') as HTMLElement
    while (rafs.length) rafs.shift()!()

    Object.defineProperty(host, 'scrollTop', { value: 0, writable: true, configurable: true })
    Object.defineProperty(host, 'scrollLeft', { value: 50, writable: true, configurable: true })
    host.dispatchEvent(new Event('scroll'))
    while (rafs.length) rafs.shift()!()

    const main = canvas2dDelegate(grid)
      .engine.getFrame()
      .viewport.regions.find((region) => region.id === 'main')!
    expect(main.scrollOffsetX).toBe(150)

    grid.destroy()
    document.body.removeChild(el)
    globalThis.requestAnimationFrame = originalRaf
  })

  it('scrollToRow 设置 scrollTop 对齐目标行', () => {
    const el = document.createElement('div')
    Object.assign(el.style, { width: '400px', height: '300px' })
    document.body.appendChild(el)
    const grid = new Grid(el, { data: makeData() })
    const host = el.querySelector('[data-novasheet-scroll-host]') as HTMLElement

    grid.scrollToRow(10, 'start')
    expect(host.scrollTop).toBe(280)

    grid.scrollToRow(0, 'start')
    expect(host.scrollTop).toBe(0)

    grid.destroy()
    document.body.removeChild(el)
  })

  it('scrollToCell 同时设置 scrollTop 与 scrollLeft', () => {
    const el = document.createElement('div')
    Object.assign(el.style, { width: '400px', height: '300px' })
    document.body.appendChild(el)
    const grid = new Grid(el, { data: makeData() })
    const host = el.querySelector('[data-novasheet-scroll-host]') as HTMLElement

    grid.setColumnWidth('name', 500)
    grid.scrollToCell(5, 'age')
    expect(host.scrollTop).toBe(140)
    expect(host.scrollLeft).toBe(180)

    grid.destroy()
    document.body.removeChild(el)
  })

  it('scrollToRow(align=end) 将行底对齐视口底', () => {
    const el = document.createElement('div')
    Object.assign(el.style, { width: '400px', height: '300px' })
    document.body.appendChild(el)
    const grid = new Grid(el, { data: makeData() })
    const host = el.querySelector('[data-novasheet-scroll-host]') as HTMLElement

    grid.scrollToRow(20, 'end')
    expect(host.scrollTop).toBe(320)

    grid.destroy()
    document.body.removeChild(el)
  })

  it('scrollToRow 越界索引不抛错', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    expect(() => grid.scrollToRow(99999, 'start')).not.toThrow()
    expect(() => grid.scrollToRow(-1, 'start')).not.toThrow()
    grid.destroy()
  })

  it('ResizeObserver 式容器 resize 在 RAF 后更新 viewport 与 HighDPI', () => {
    const rafs: Array<FrameRequestCallback> = []
    const originalRaf = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      rafs.push(cb)
      return rafs.length
    }) as typeof requestAnimationFrame

    const el = document.createElement('div')
    Object.assign(el.style, { width: '400px', height: '300px' })
    document.body.appendChild(el)
    const grid = new Grid(el, { data: makeData() })

    const viewport = canvas2dDelegate(grid).engine.getViewport()
    const setSizeSpy = spyOn(viewport, 'setSize')
    const highDpi = canvas2dDelegate(grid).highDpi
    const resizeSpy = spyOn(highDpi, 'resize')

    Object.defineProperty(el, 'clientWidth', { value: 500, configurable: true })
    Object.defineProperty(el, 'clientHeight', { value: 400, configurable: true })
    grid._onContainerResize()
    expect(resizeSpy).not.toHaveBeenCalled()
    rafs[rafs.length - 1]!(performance.now())
    expect(setSizeSpy).toHaveBeenCalledWith(500, 400)
    expect(resizeSpy).toHaveBeenCalledWith(500, 400)

    globalThis.requestAnimationFrame = originalRaf
    grid.destroy()
    document.body.removeChild(el)
  })
})

describe('Grid — Phase 4.0 context menu facade', () => {
  it('contextmenu on body cell opens menu; Cut click invokes onContextMenuAction', () => {
    const container = document.createElement('div')
    Object.assign(container.style, { width: '400px', height: '300px', position: 'relative' })
    document.body.appendChild(container)
    const onAction = mock((_a: string, _c: never) => {})
    const grid = new Grid(container, {
      data: new InMemoryDataSource({
        schema: { fields: [{ id: 'a', name: 'A', type: 'text', width: 100 }] },
        rows: [{ a: '1' }, { a: '2' }, { a: '3' }],
      }),
      onContextMenuAction: onAction as never,
    })

    const scrollHost = container.querySelector('[data-novasheet-scroll-host]') as HTMLElement
    scrollHost.dispatchEvent(
      new MouseEvent('contextmenu', { clientX: 50, clientY: 100, bubbles: true, cancelable: true }),
    )

    const cutBtn = document.body.querySelector('[data-ns-action="cut"]') as HTMLButtonElement
    expect(cutBtn).toBeTruthy()
    cutBtn.click()

    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onAction.mock.calls[0]![0]).toBe('cut')

    grid.destroy()
    document.body.removeChild(container)
  })

  it('Phase 4.1: Paste 项在 MutableDataSource 下默认 enabled（不再依赖 setClipboardReady）', () => {
    const container = document.createElement('div')
    Object.assign(container.style, { width: '400px', height: '300px', position: 'relative' })
    document.body.appendChild(container)
    const grid = new Grid(container, {
      data: new InMemoryDataSource({
        schema: { fields: [{ id: 'a', name: 'A', type: 'text', width: 100 }] },
        rows: [{ a: '1' }],
      }),
    })
    const scrollHost = container.querySelector('[data-novasheet-scroll-host]') as HTMLElement

    scrollHost.dispatchEvent(
      new MouseEvent('contextmenu', { clientX: 30, clientY: 80, bubbles: true, cancelable: true }),
    )
    const pasteBtn = document.body.querySelector('[data-ns-action="paste"]') as HTMLButtonElement
    expect(pasteBtn.getAttribute('aria-disabled')).toBeNull()

    // setClipboardReady 保留 API（4.0 兼容）但不再影响 enabled 状态
    grid.setClipboardReady(false)
    grid.closeContextMenu()
    scrollHost.dispatchEvent(
      new MouseEvent('contextmenu', { clientX: 30, clientY: 80, bubbles: true, cancelable: true }),
    )
    const pasteBtn2 = document.body.querySelector('[data-ns-action="paste"]') as HTMLButtonElement
    expect(pasteBtn2.getAttribute('aria-disabled')).toBeNull()

    grid.destroy()
    document.body.removeChild(container)
  })

  it('Grid.destroy() removes menu layer DOM', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const grid = new Grid(container, {
      data: new InMemoryDataSource({
        schema: { fields: [{ id: 'a', name: 'A', type: 'text', width: 100 }] },
        rows: [],
      }),
    })
    expect(document.body.querySelector('[data-novasheet-context-menu-layer]')).toBeTruthy()
    grid.destroy()
    expect(document.body.querySelector('[data-novasheet-context-menu-layer]')).toBeNull()
    document.body.removeChild(container)
  })
})

describe('Grid — Phase 4.4 view pipeline facade', () => {
  it('returns stable sort, filter, and pipeline instances', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })

    expect(grid.getSortLayer()).toBe(grid.getSortLayer())
    expect(grid.getFilterLayer()).toBe(grid.getFilterLayer())
    expect(grid.getViewPipeline()).toBe(grid.getViewPipeline())

    grid.destroy()
  })

  it('emits sortChange with the active spec', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    const handler = mock((_event: { spec: unknown }) => {})
    const spec = { fieldId: 'age', direction: 'desc' as const }

    const unsubscribe = grid.on('sortChange', handler)
    grid.getSortLayer().setSpec(spec)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0]![0]).toEqual({ spec })

    unsubscribe()
    grid.destroy()
  })

  it('emits filterChange with the active spec', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    const handler = mock((_event: { spec: unknown }) => {})
    const spec = {
      fieldId: 'name',
      op: { kind: 'text-contains' as const, value: 'n1', caseSensitive: false },
    }

    const unsubscribe = grid.on('filterChange', handler)
    grid.getFilterLayer().setSpec(spec)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0]![0]).toEqual({ spec })

    unsubscribe()
    grid.destroy()
  })

  it('emits viewChange with the changed layer id', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    const handler = mock((_event: { layerId: 'sort' | 'filter' }) => {})

    const unsubscribe = grid.on('viewChange', handler)
    grid.getSortLayer().setSpec({ fieldId: 'age', direction: 'asc' })

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0]![0]).toEqual({ layerId: 'sort' })

    unsubscribe()
    grid.destroy()
  })

  it('stops delivering events after unsubscribe', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    const handler = mock((_event: { layerId: 'sort' | 'filter' }) => {})

    const unsubscribe = grid.on('viewChange', handler)
    unsubscribe()
    grid.getSortLayer().setSpec({ fieldId: 'age', direction: 'asc' })

    expect(handler).not.toHaveBeenCalled()

    grid.destroy()
  })

  it('setData clears sort and filter specs', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })

    grid.getSortLayer().setSpec({ fieldId: 'age', direction: 'asc' })
    grid.getFilterLayer().setSpec({
      fieldId: 'name',
      op: { kind: 'text-contains', value: 'n1', caseSensitive: false },
    })

    const newData = new InMemoryDataSource({ schema: SCHEMA, rows: [{ name: 'X', age: 1 }] })
    grid.setData(newData)

    expect(grid.getSortLayer().getSpec()).toBeNull()
    expect(grid.getFilterLayer().getSpec()).toBeNull()

    grid.destroy()
  })

  it('setData updates runtime header-menu pipeline wiring', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    const delegate = canvas2dDelegate(grid)
    const oldPipeline = delegate.getViewPipeline()

    const newData = new InMemoryDataSource({
      schema: {
        fields: [{ id: 'fresh', name: 'Fresh', type: 'text', width: 100 }],
      },
      rows: [{ fresh: 'new' }],
    })
    grid.setData(newData)

    expect(delegate.getViewPipeline()).not.toBe(oldPipeline)
    expect(delegate.runtime.viewPipeline).toBe(delegate.getViewPipeline())

    grid.destroy()
  })

  it('disposes replaced and destroyed pipelines so old sources cannot emit view changes', () => {
    const el = document.createElement('div')
    const oldSource = makeData()
    const currentSource = new InMemoryDataSource({
      schema: SCHEMA,
      rows: [{ name: 'current', age: 1 }],
    })
    const grid = new Grid(el, { data: oldSource })
    const handler = mock((_event: { layerId: 'sort' | 'filter' }) => {})

    grid.on('viewChange', handler)
    grid.getSortLayer().setSpec({ fieldId: 'age', direction: 'asc' })
    grid.getFilterLayer().setSpec({
      fieldId: 'name',
      op: { kind: 'text-contains', value: 'n', caseSensitive: false },
    })
    expect(handler).toHaveBeenCalledTimes(2)

    grid.setData(currentSource)
    oldSource.setRows([{ name: 'stale', age: 99 }])
    expect(handler).toHaveBeenCalledTimes(2)

    grid.getSortLayer().setSpec({ fieldId: 'age', direction: 'desc' })
    expect(handler).toHaveBeenCalledTimes(3)

    grid.destroy()
    currentSource.setRows([{ name: 'after destroy', age: 2 }])
    oldSource.setRows([{ name: 'old after destroy', age: 3 }])
    expect(handler).toHaveBeenCalledTimes(3)
  })

  it('preserves undo across sort view changes', () => {
    const el = document.createElement('div')
    const data = makeData()
    const grid = new Grid(el, { data })
    const { engine } = canvas2dDelegate(grid)

    engine.beginCellEdit({ rowIndex: 0, colIndex: 0 })
    engine.updateCellEditDraft('edited')
    expect(engine.commitCellEdit()).toBe(true)
    expect(data.getCell(0, 'name')).toBe('edited')

    grid.getSortLayer().setSpec({ fieldId: 'age', direction: 'desc' })
    grid.undo()

    expect(data.getCell(0, 'name')).toBe('n0')
    grid.destroy()
  })

  it('remaps selection to the same underlying row across sort view changes', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    const { engine } = canvas2dDelegate(grid)

    engine.selectCell({ rowIndex: 0, colIndex: 1 })
    grid.getSortLayer().setSpec({ fieldId: 'age', direction: 'desc' })

    expect(engine.getSelection().activeCell).toEqual({ rowIndex: 49, colIndex: 1 })
    expect(engine.getData().resolveUnderlyingRow?.(49)).toBe(0)
    grid.destroy()
  })
})
