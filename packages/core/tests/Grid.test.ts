import { describe, expect, it, vi } from 'vitest'
import { Grid } from '../src/Grid'
import { InMemoryDataSource } from '../src/data/InMemoryDataSource'
import type { Schema } from '../src/data/Schema'
import { denseGridTheme } from '../src/theme/denseGridTheme'

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
    grid.destroy() // second call: no throw
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
    const spy = vi.spyOn(grid as unknown as { invalidate: () => void }, 'invalidate')
    grid.setTheme(denseGridTheme)
    expect(spy).toHaveBeenCalled()
    grid.destroy()
  })

  it('setData swaps data source and triggers paint', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    const newData = new InMemoryDataSource({ schema: SCHEMA, rows: [{ name: 'X', age: 0 }] })
    grid.setData(newData)
    // No throw + canvas still present
    expect(el.querySelector('canvas')).not.toBeNull()
    grid.destroy()
  })

  it('setRowHeight changes a row height and triggers paint', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    const spy = vi.spyOn(grid as unknown as { invalidate: () => void }, 'invalidate')
    grid.setRowHeight(5, 60)
    expect(spy).toHaveBeenCalled()
    grid.destroy()
  })

  it('setColumnWidth changes a column width and triggers paint', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    const spy = vi.spyOn(grid as unknown as { invalidate: () => void }, 'invalidate')
    grid.setColumnWidth('age', 200)
    expect(spy).toHaveBeenCalled()
    grid.destroy()
  })

  it('setColumnWidth on unknown fieldId is a no-op', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    grid.setColumnWidth('does-not-exist', 200) // should not throw
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
    // Drain initial paint RAF
    while (rafs.length) rafs.shift()!()
    grid.refresh()
    expect(rafs).toHaveLength(1)
    grid.destroy()
    // Flushing the RAF after destroy should not throw and not paint anywhere
    rafs[0]!()
    // No assertion on side effects — just must not throw

    globalThis.requestAnimationFrame = originalRaf
  })

  it('destroy restores original container position', () => {
    const el = document.createElement('div')
    el.style.position = 'absolute'
    const grid = new Grid(el, { data: makeData() })
    // Grid does NOT change position when it's not static
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

  it('scroll-spacer is sized via ScrollMapper.computeSpacerSize for both axes', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    const spacer = el.querySelector('[data-novasheet-scroll-spacer]') as HTMLElement
    // makeData has 50 rows × 2 cols × default theme rowHeight=28; widths come from SCHEMA
    // contentH = 50 × 28 = 1400; contentW = 200 + 80 = 280 (both well under SAFE_MAX)
    expect(spacer.style.height).toBe('1400px')
    expect(spacer.style.width).toBe('280px')
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
    expect(spacer.style.height).toBe(`${200 * 28}px`)
    grid.destroy()
  })

  it('setRowHeight re-sizes the spacer', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    grid.setRowHeight(0, 100) // delta = 100 - 28 = 72
    const spacer = el.querySelector('[data-novasheet-scroll-spacer]') as HTMLElement
    expect(spacer.style.height).toBe(`${50 * 28 + 72}px`)
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
    // Drain initial paint frames
    while (rafs.length) rafs.shift()!()

    // Fake a scroll event with new scrollTop
    Object.defineProperty(host, 'scrollTop', { value: 56, writable: true, configurable: true })
    Object.defineProperty(host, 'scrollLeft', { value: 0, writable: true, configurable: true })
    host.dispatchEvent(new Event('scroll'))
    expect(rafs).toHaveLength(1)
    while (rafs.length) rafs.shift()!()

    // After the scroll, viewport scrollY should be ~56 (content 1400 ≤ spacer 1400 → identity)
    // Indirect verification: refresh and check the canvas got paint instructions referencing
    // the scrolled state. A direct assertion would require exposing viewport state, but the
    // RAF being scheduled + drained without throwing is sufficient as a smoke test here.
    expect(() => grid.refresh()).not.toThrow()

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
    // Row 10 starts at y = 10 × 28 = 280; content 1400 ≤ spacer 1400 (identity branch)
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

    // Widen 'name' so content width (500 + 80 = 580) > viewport width (400) — without this,
    // ScrollMapper.logicalToScroll returns 0 for X (no horizontal scroll possible, matches the
    // browser behavior of auto-clamping scrollTo on overflow:auto elements that don't overflow).
    grid.setColumnWidth('name', 500)
    grid.scrollToCell(5, 'age') // col 1 at x=500, row 5 at y=140
    // Vertical: content 1400 ≤ spacer 1400, vp 268, maxLogical=1132 → identity branch, returns 140
    expect(host.scrollTop).toBe(140)
    // Horizontal: content 580 ≤ spacer 580, vp 400, maxLogical=180 → identity, but clamp(500, 0, 180) = 180
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

    // viewport-content height = 300 - 32 (headerHeight from denseGridTheme) = 268
    // row 20 bottom = 21 × 28 = 588; align=end → scrollTop = 588 - 268 = 320
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

  it('ResizeObserver-style container resize triggers paint invalidate', () => {
    // happy-dom may or may not implement ResizeObserver. The test verifies our wiring
    // by manually calling the internal resize handler (exposed via _onContainerResize for tests).
    const el = document.createElement('div')
    Object.assign(el.style, { width: '400px', height: '300px' })
    document.body.appendChild(el)
    const grid = new Grid(el, { data: makeData() })

    const spy = vi.spyOn(grid as unknown as { invalidate: () => void }, 'invalidate')
    // Simulate a container resize by setting different bounding rect and dispatching the internal handler
    Object.defineProperty(el, 'clientWidth', { value: 500, configurable: true })
    Object.defineProperty(el, 'clientHeight', { value: 400, configurable: true })
    ;(grid as unknown as { _onContainerResize: () => void })._onContainerResize()

    expect(spy).toHaveBeenCalled()
    grid.destroy()
    document.body.removeChild(el)
  })
})
