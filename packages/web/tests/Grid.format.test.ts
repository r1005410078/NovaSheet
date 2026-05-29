import { describe, expect, it } from 'bun:test'
import { Grid } from '../src/Grid'
import { InMemoryDataSource } from '@novasheet/core'

describe('Grid Phase 5-A APIs', () => {
  it('forwards fill, border, merge, and unmerge to the controller', () => {
    const container = document.createElement('div')
    const grid = new Grid(container, {
      data: new InMemoryDataSource({
        schema: {
          fields: [
            { id: 'a', name: 'A', type: 'text', width: 100 },
            { id: 'b', name: 'B', type: 'text', width: 100 },
          ],
        },
        rows: [{ a: 'A1', b: 'B1' }, { a: 'A2', b: 'B2' }],
      }),
    })

    expect(grid.setFillColor({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }, '#fff2cc')).toBe(true)
    expect(
      grid.setBorders(
        { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
        'outer',
        { color: '#d93025', width: 'thin', lineStyle: 'solid' },
      ),
    ).toBe(true)
    expect(grid.mergeCells({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 })).toBe(true)
    expect(grid.unmergeCells({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 })).toBe(true)

    grid.destroy()
  })
})
