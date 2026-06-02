import { describe, expect, it, mock } from 'bun:test'
import { InMemoryDataSource, createSheetContext, denseGridTheme } from '@novasheet/core'
import { getWebDragContributions } from '@novasheet/web'
import { Grid } from '../src/Grid'

const schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text' as const, width: 100 },
    { id: 'b', name: 'B', type: 'text' as const, width: 100 },
    { id: 'c', name: 'C', type: 'text' as const, width: 100 },
  ],
}

function mkGrid(onColumnsMoved?: (event: { fieldIds: readonly string[]; beforeFieldId: string | null }) => void) {
  const data = new InMemoryDataSource({
    schema: { fields: schema.fields.map((field) => ({ ...field })) },
    rows: [{ a: 'A', b: 'B', c: 'C' }],
  })
  const container = document.createElement('div')
  Object.assign(container.style, { width: '500px', height: '300px' })
  document.body.appendChild(container)
  return {
    grid: new Grid(container, { data, theme: denseGridTheme, onColumnsMoved }),
    data,
    container,
  }
}

describe('Grid column reorder — Phase 4.7', () => {
  it('installs row and column reorder drags in the default sheet context', () => {
    const ctx = createSheetContext<CanvasRenderingContext2D, HTMLElement>()
    const data = new InMemoryDataSource({
      schema: { fields: schema.fields.map((field) => ({ ...field })) },
      rows: [{ a: 'A', b: 'B', c: 'C' }],
    })
    const container = document.createElement('div')
    const grid = new Grid(container, {
      data,
      context: ctx,
      theme: denseGridTheme,
    })

    expect(getWebDragContributions(ctx).map((contribution) => contribution.id)).toEqual([
      'resize',
      'column-header-reorder',
      'row-header-reorder',
    ])

    grid.destroy()
  })

  it('Grid.moveCols delegates and emits onColumnsMoved only when order changes', () => {
    const onColumnsMoved = mock<(event: { fieldIds: readonly string[]; beforeFieldId: string | null }) => void>()
    const { grid, data, container } = mkGrid(onColumnsMoved)

    expect(grid.moveCols(['a'], null)).toBe(true)

    expect(data.getSchema().fields.map((field) => field.id)).toEqual(['b', 'c', 'a'])
    expect(onColumnsMoved).toHaveBeenCalledWith({ fieldIds: ['a'], beforeFieldId: null })

    onColumnsMoved.mockClear()
    expect(grid.moveCols(['a'], null)).toBe(false)
    expect(onColumnsMoved).not.toHaveBeenCalled()

    grid.destroy()
    container.remove()
  })
})
