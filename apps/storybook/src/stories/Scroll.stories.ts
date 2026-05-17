import type { Meta, StoryObj } from '@storybook/html'
import { Grid } from '@novasheet/web-canvas2d'
import { InMemoryDataSource, type Schema } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { GeneratedDataSource } from '../generated-data-source'

const schema: Schema = {
  fields: [
    { id: 'idx', name: 'Index', type: 'number', width: 80 },
    { id: 'name', name: 'Name', type: 'text', width: 200 },
    { id: 'category', name: 'Category', type: 'text', width: 160 },
    { id: 'value', name: 'Value', type: 'number', width: 120 },
  ],
}

const meta: Meta = {
  title: 'Grid/Scroll',
  parameters: { layout: 'centered' },
}
export default meta
type Story = StoryObj

/** A regular-sized dataset that requires scrolling — the M2 happy path. */
export const TenThousandRows: Story = {
  render: () => {
    const rows = Array.from({ length: 10_000 }, (_, i) => ({
      idx: i,
      name: `Item ${i}`,
      category: ['alpha', 'beta', 'gamma', 'delta'][i % 4]!,
      value: Math.round(Math.sin(i) * 10_000) / 100,
    }))
    const data = new InMemoryDataSource({ schema, rows })
    return createGridHost({ data })
  },
}

/**
 * 1,000,000 rows × 30 columns via **GeneratedDataSource** — full Phase 1
 * stress test, **0ms mount** (no preallocation).
 *
 * Covers both:
 *   - non-linear vertical scroll (28M px content capped at 6M spacer)
 *   - horizontal scroll (4200 px content vs 780 px host)
 *
 * Why no allocation lag: GeneratedDataSource computes cell values on demand
 * via `cellFn(row, fieldId)`. Renderer only ever asks for ~30 × ~6 = 180
 * visible cells per frame, each ~1μs to compute. Memory stays O(1).
 *
 * Constrast: the equivalent InMemoryDataSource version would allocate ~30M
 * JS values upfront (3-8s, 600-900MB heap) before the first paint.
 */
export const OneMillionRows: Story = {
  render: () => {
    const colCount = 30
    const wideSchema: Schema = {
      fields: Array.from({ length: colCount }, (_, c) => ({
        id: `c${c}`,
        name: `Column ${c}`,
        type: c % 3 === 0 ? ('number' as const) : ('text' as const),
        width: 140,
      })),
    }
    const data = new GeneratedDataSource(1_000_000, wideSchema, (r, fieldId) => {
      const c = Number(fieldId.slice(1))
      return c % 3 === 0 ? r * 100 + c : `r${r}-c${c}`
    })
    return createGridHost({ data })
  },
}

/**
 * Demonstrates programmatic scrollTo: scrolls to row 500 on initial render.
 * Useful for verifying the scrollToRow API works (e.g., for jump-to-anchor flows).
 */
export const ScrollToRow500: Story = {
  render: () => {
    const rows = Array.from({ length: 2_000 }, (_, i) => ({
      idx: i,
      name: `Row ${i}`,
      category: ['alpha', 'beta', 'gamma'][i % 3]!,
      value: i,
    }))
    const data = new InMemoryDataSource({ schema, rows })
    const host = createGridHost({ data })
    // Defer one frame so the Grid finishes initial mount + first paint before scrolling.
    requestAnimationFrame(() => {
      const grid = (host as HTMLElement & { __grid: Grid }).__grid
      grid.scrollToRow(500, 'center')
    })
    return host
  },
}

/**
 * Wide schema (30 columns × 140 px = 4200 px content width) in a 780 px host —
 * triggers the **horizontal** native scrollbar in addition to vertical.
 * Wheel / shift+wheel / trackpad two-finger swipe all work via the same NativeScroller.
 */
export const BothAxisScroll: Story = {
  render: () => {
    const colCount = 30
    const wideSchema: Schema = {
      fields: Array.from({ length: colCount }, (_, c) => ({
        id: `c${c}`,
        name: `Column ${c}`,
        type: c % 3 === 0 ? ('number' as const) : ('text' as const),
        width: 140,
      })),
    }
    const rows = Array.from({ length: 500 }, (_, r) => {
      const row: Record<string, string | number> = {}
      for (let c = 0; c < colCount; c++) {
        row[`c${c}`] = c % 3 === 0 ? r * 100 + c : `r${r}-c${c}`
      }
      return row
    })
    const data = new InMemoryDataSource({ schema: wideSchema, rows })
    return createGridHost({ data })
  },
}

/**
 * Programmatic horizontal scroll demo — scrolls to column 20 on mount via scrollToCell.
 * Pairs with BothAxisScroll for the X axis what ScrollToRow500 does for Y.
 */
export const ScrollToCellFar: Story = {
  render: () => {
    const colCount = 30
    const wideSchema: Schema = {
      fields: Array.from({ length: colCount }, (_, c) => ({
        id: `c${c}`,
        name: `Column ${c}`,
        type: 'text' as const,
        width: 140,
      })),
    }
    const rows = Array.from({ length: 500 }, (_, r) => {
      const row: Record<string, string> = {}
      for (let c = 0; c < colCount; c++) row[`c${c}`] = `r${r}-c${c}`
      return row
    })
    const data = new InMemoryDataSource({ schema: wideSchema, rows })
    const host = createGridHost({ data })
    requestAnimationFrame(() => {
      const grid = (host as HTMLElement & { __grid: Grid }).__grid
      grid.scrollToCell(100, 'c20')
    })
    return host
  },
}
