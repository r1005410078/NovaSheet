import { describe, expect, it, spyOn } from 'bun:test'
import { InMemoryDataSource, denseGridTheme, type Schema } from '@novasheet/core'
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
        runtime: { refresh: () => void }
        engine: {
          getViewport: () => {
            setScroll: (x: number, y: number) => void
            setSize: (w: number, h: number) => void
          }
        }
        highDpi: { resize: (w: number, h: number) => void }
      }
    }
  ).delegate
}

function runtimeRefreshSpy(grid: Grid) {
  return spyOn(canvas2dDelegate(grid).runtime, 'refresh')
}

describe('Grid', () => {
  it('mounts a canvas into the container', () => {
    const el = document.createElement('div')
    Object.assign(el.style, { width: '400px', height: '300px' })
    document.body.appendChild(el)
    const grid = new Grid(el, { data: makeData() })
    expect(el.querySelector('canvas')).not.toBeNull()
    grid.destroy()
    document.body.removeChild(el)
  })

  it('destroy is idempotent and removes canvas', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    grid.destroy()
    grid.destroy()
    expect(el.querySelector('canvas')).toBeNull()
  })

  it('mount → destroy → mount works (Strict Mode shape)', () => {
    const el = document.createElement('div')
    const data = makeData()
    const g1 = new Grid(el, { data })
    g1.destroy()
    const g2 = new Grid(el, { data })
    expect(el.querySelectorAll('canvas')).toHaveLength(1)
    g2.destroy()
  })

  it('setTheme triggers re-paint', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    const spy = runtimeRefreshSpy(grid)
    grid.setTheme(denseGridTheme)
    expect(spy).toHaveBeenCalled()
    grid.destroy()
  })

  it('setData swaps data source and triggers paint', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    const newData = new InMemoryDataSource({ schema: SCHEMA, rows: [{ name: 'X', age: 0 }] })
    grid.setData(newData)
    expect(el.querySelector('canvas')).not.toBeNull()
    grid.destroy()
  })

  it('setRowHeight changes a row height and triggers paint', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    const spy = runtimeRefreshSpy(grid)
    grid.setRowHeight(5, 60)
    expect(spy).toHaveBeenCalled()
    grid.destroy()
  })

  it('setColumnWidth changes a column width and triggers paint', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    const spy = runtimeRefreshSpy(grid)
    grid.setColumnWidth('age', 200)
    expect(spy).toHaveBeenCalled()
    grid.destroy()
  })

  it('setColumnWidth on unknown fieldId is a no-op', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    grid.setColumnWidth('does-not-exist', 200)
    grid.destroy()
  })

  it('destroy cancels pending renderer flush', () => {
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

  it('destroy restores original container position', () => {
    const el = document.createElement('div')
    el.style.position = 'absolute'
    const grid = new Grid(el, { data: makeData() })
    expect(el.style.position).toBe('absolute')
    grid.destroy()
    expect(el.style.position).toBe('absolute')
  })

  it('mounts scroll-host, scroll-spacer, and canvas with correct DOM hierarchy', () => {
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

  it('canvas has pointer-events: none so scroll events pass through', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    const canvas = el.querySelector('canvas') as HTMLCanvasElement
    expect(canvas.style.pointerEvents).toBe('none')
    grid.destroy()
  })

  it('scroll-host has overflow auto so it produces a native scrollbar', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    const host = el.querySelector('[data-novasheet-scroll-host]') as HTMLElement
    expect(host.style.overflow).toBe('auto')
    grid.destroy()
  })

  it('scroll-host paints above canvas via z-index so native scrollbar stays visible', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    const host = el.querySelector('[data-novasheet-scroll-host]') as HTMLElement
    const canvas = el.querySelector('canvas') as HTMLCanvasElement
    expect(Number(host.style.zIndex)).toBeGreaterThan(Number(canvas.style.zIndex))
    grid.destroy()
  })

  it('scroll-spacer is sized via ScrollMapper.computeSpacerSize for both axes', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    const spacer = el.querySelector('[data-novasheet-scroll-spacer]') as HTMLElement
    expect(spacer.style.height).toBe('1432px')
    expect(spacer.style.width).toBe('280px')
    grid.destroy()
  })

  it('setColumnWidth re-sizes the spacer width', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    grid.setColumnWidth('name', 500)
    const spacer = el.querySelector('[data-novasheet-scroll-spacer]') as HTMLElement
    expect(spacer.style.width).toBe(`${280 + 300}px`)
    grid.destroy()
  })

  it('destroy removes scroll-host along with canvas', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    grid.destroy()
    expect(el.querySelector('[data-novasheet-scroll-host]')).toBeNull()
    expect(el.querySelector('canvas')).toBeNull()
  })

  it('setData re-sizes the spacer to match the new dataset', () => {
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

  it('setRowHeight re-sizes the spacer', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    grid.setRowHeight(0, 100)
    const spacer = el.querySelector('[data-novasheet-scroll-spacer]') as HTMLElement
    expect(spacer.style.height).toBe(`${50 * 28 + 72 + 32}px`)
    grid.destroy()
  })

  it('forwards native scroll events to viewport via ScrollMapper', () => {
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

  it('scrollToRow moves the scroll-host scrollTop to align the row', () => {
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

  it('scrollToCell moves both scrollTop and scrollLeft', () => {
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

  it('scrollToRow with align=end aligns the row bottom to viewport bottom', () => {
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

  it('scrollToRow with out-of-range index does not throw', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    expect(() => grid.scrollToRow(99999, 'start')).not.toThrow()
    expect(() => grid.scrollToRow(-1, 'start')).not.toThrow()
    grid.destroy()
  })

  it('ResizeObserver-style container resize propagates new size to viewport, HighDPI, and triggers invalidate', () => {
    const el = document.createElement('div')
    Object.assign(el.style, { width: '400px', height: '300px' })
    document.body.appendChild(el)
    const grid = new Grid(el, { data: makeData() })

    const invalidateSpy = runtimeRefreshSpy(grid)
    const viewport = canvas2dDelegate(grid).engine.getViewport()
    const setSizeSpy = spyOn(viewport, 'setSize')
    const highDpi = canvas2dDelegate(grid).highDpi
    const resizeSpy = spyOn(highDpi, 'resize')

    Object.defineProperty(el, 'clientWidth', { value: 500, configurable: true })
    Object.defineProperty(el, 'clientHeight', { value: 400, configurable: true })
    grid._onContainerResize()

    expect(invalidateSpy).toHaveBeenCalled()
    expect(setSizeSpy).toHaveBeenCalledWith(500, 400)
    expect(resizeSpy).toHaveBeenCalledWith(500, 400)
    grid.destroy()
    document.body.removeChild(el)
  })
})
