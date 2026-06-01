import { describe, expect, it } from 'bun:test'
import { createSheetContext, InMemoryDataSource, type CellAddress } from '@novasheet/core'
import { Grid } from '../src/Grid'

function canvas2dDelegate(grid: Grid) {
  return (
    grid as unknown as {
      delegate: {
        openCustomCellEditorForTest: (cell: CellAddress) => boolean
      }
    }
  ).delegate
}

describe('cell edit extensions', () => {
  it('calls custom edit and exposes overlay handle', () => {
    const ctx = createSheetContext<CanvasRenderingContext2D, HTMLElement>()
    let opened = false

    ctx.extensions.cell('rating', {
      edit: () => {
        const root = document.createElement('button')
        root.textContent = '5'
        ctx.overlay().openPopover({ anchor: ctx.cell().rect(), content: root })
        opened = true
      },
    })

    const el = document.createElement('div')
    Object.assign(el.style, { width: '300px', height: '160px' })

    const grid = new Grid(el, {
      data: new InMemoryDataSource({
        schema: { fields: [{ id: 'score', name: 'Score', type: 'rating' as never, width: 120 }] },
        rows: [{ score: 3 }],
      }),
      context: ctx,
    })

    expect(canvas2dDelegate(grid).openCustomCellEditorForTest({ rowIndex: 0, colIndex: 0 })).toBe(
      true,
    )

    expect(opened).toBe(true)
    expect(el.querySelector('[data-novasheet-extension-popover]')?.textContent).toBe('5')
    grid.destroy()
  })
})
