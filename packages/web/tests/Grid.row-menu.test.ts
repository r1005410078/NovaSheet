import { describe, expect, it } from 'bun:test'
import { Grid } from '../src/Grid'
import { InMemoryDataSource, denseGridTheme } from '@novasheet/core'

describe('Grid row header context menu', () => {
  it('选中 1 行后菜单出现 Insert above / Insert below / Delete / Hide / Resize 5 项（无 hidden gap 时 Unhide 隐藏）', () => {
    const ds = new InMemoryDataSource({
      schema: { fields: [{ id: 'a', name: 'A', type: 'text' as const, width: 100 }] },
      rows: [{ a: 'r0' }, { a: 'r1' }, { a: 'r2' }],
    })
    const container = document.createElement('div')
    Object.assign(container.style, { width: '300px', height: '200px' })
    document.body.appendChild(container)
    const grid = new Grid(container, { data: ds, theme: denseGridTheme })

    grid.setSelection({
      activeCell: { rowIndex: 1, colIndex: 0 },
      anchorCell: { rowIndex: 1, colIndex: 0 },
      extentCell: { rowIndex: 1, colIndex: 0 },
      selectedRange: { startRow: 1, endRow: 1, startCol: 0, endCol: 0 },
    })

    const items = grid.getRowHeaderContextMenuItems({ targetRowIndex: 1 })
    const ids = items.map((i) => i.id)
    expect(ids).toContain('insert-above')
    expect(ids).toContain('insert-below')
    expect(ids).toContain('delete-rows')
    expect(ids).toContain('hide-rows')
    expect(ids).toContain('resize-row-height')
    expect(ids).not.toContain('unhide-rows')
    grid.destroy()
  })

  it('选区跨 hidden gap 时 Unhide rows in selection 出现', () => {
    const ds = new InMemoryDataSource({
      schema: { fields: [{ id: 'a', name: 'A', type: 'text' as const, width: 100 }] },
      rows: Array.from({ length: 5 }, (_, i) => ({ a: `r${i}` })),
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const grid = new Grid(container, { data: ds, theme: denseGridTheme })
    grid.hideRows([2])
    grid.setSelection({
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 3, colIndex: 0 },
      selectedRange: { startRow: 0, endRow: 3, startCol: 0, endCol: 0 },
    })
    const items = grid.getRowHeaderContextMenuItems({ targetRowIndex: 0 })
    expect(items.map((i) => i.id)).toContain('unhide-rows')
    grid.destroy()
  })

  it('调用 Insert above 触发 Grid.insertRows', () => {
    const ds = new InMemoryDataSource({
      schema: { fields: [{ id: 'a', name: 'A', type: 'text' as const, width: 100 }] },
      rows: [{ a: 'r0' }, { a: 'r1' }],
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const grid = new Grid(container, { data: ds, theme: denseGridTheme })
    grid.setSelection({
      activeCell: { rowIndex: 1, colIndex: 0 },
      anchorCell: { rowIndex: 1, colIndex: 0 },
      extentCell: { rowIndex: 1, colIndex: 0 },
      selectedRange: { startRow: 1, endRow: 1, startCol: 0, endCol: 0 },
    })
    grid.invokeRowHeaderContextMenuAction('insert-above', { targetRowIndex: 1 })
    expect(ds.getRowCount()).toBe(3)
    grid.destroy()
  })
})
