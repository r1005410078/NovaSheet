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
})
