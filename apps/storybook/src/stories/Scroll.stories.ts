import type { Meta, StoryObj } from '@storybook/html'
import { Grid, InMemoryDataSource, type Schema } from '@novasheet/core'
import { createGridHost } from '../grid-host'

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
 * 1,000,000 rows — exceeds Firefox / iOS Safari element-height limits (~17.9M / ~16.7M),
 * so ScrollMapper.computeSpacerSize caps the spacer at 6,000,000 px and the scrollTop is
 * mapped non-linearly. Wheel / trackpad scroll smoothly; the scrollbar thumb covers
 * ~4.67 logical rows per pixel.
 *
 * Allocation note: ~1M plain JS objects ≈ 150MB heap. Render is slow on weak machines;
 * the M5 column-typed TypedArray generator will fix this. For now, the story is the
 * canonical "stress test" demo.
 */
export const OneMillionRows: Story = {
  render: () => {
    const categories = ['alpha', 'beta', 'gamma', 'delta'] as const
    const rows = new Array<Record<string, string | number>>(1_000_000)
    for (let i = 0; i < rows.length; i++) {
      rows[i] = {
        idx: i,
        name: `Row ${i}`,
        category: categories[i % 4]!,
        value: i * 0.5,
      }
    }
    const data = new InMemoryDataSource({ schema, rows })
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
