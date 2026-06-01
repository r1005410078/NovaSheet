import { describe, expect, it } from 'bun:test'
import { createSheetContext, InMemoryDataSource, type SheetContext } from '@novasheet/core'
import { Grid } from '../src/Grid'

const data = new InMemoryDataSource({
  schema: { fields: [{ id: 'score', name: 'Score', type: 'text', width: 120 }] },
  rows: [{ score: 3 }],
})

describe('Grid SheetContext options', () => {
  it('uses the provided context', () => {
    const ctx = createSheetContext()
    ctx.extensions.cell('rating', { text: () => 'rating' })

    const grid = new Grid(document.createElement('div'), { data, context: ctx })

    expect(ctx.registry.cells.has('rating')).toBe(true)
    grid.destroy()
  })

  it('installs extensions into the selected context', () => {
    const ctx = createSheetContext()

    const grid = new Grid(document.createElement('div'), {
      data,
      context: ctx,
      extensions: [(sheet: SheetContext) => sheet.extensions.cell('rating', { text: () => 'rating' })],
    })

    expect(ctx.registry.cells.has('rating')).toBe(true)
    grid.destroy()
  })
})
