import { describe, expect, it } from 'bun:test'
import { Grid } from '@zhiguang/core'
import { canvas2dBackend } from '../../src/backend/canvas2dBackend'
import { InMemoryDataSource, denseGridTheme } from '@zhiguang/core'

const schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text' as const, width: 100 },
    { id: 'b', name: 'B', type: 'number' as const, width: 80 },
    { id: 'c', name: 'C', type: 'text' as const, width: 120 },
  ],
}

function mkGrid() {
  const data = new InMemoryDataSource({
    schema: { fields: schema.fields.map((field) => ({ ...field })) },
    rows: [
      { a: 'r0', b: 0, c: 'x' },
      { a: 'r1', b: 1, c: 'y' },
    ],
  })
  const container = document.createElement('div')
  Object.assign(container.style, { width: '500px', height: '300px' })
  document.body.appendChild(container)
  return { grid: new Grid(container, { backend: canvas2dBackend(), data, theme: denseGridTheme }), data, container }
}

describe('Grid column header context menu — Phase 4.6', () => {
  it('选中 1 列后 getColumnHeaderContextMenuItems 含 5 个结构项', () => {
    const { grid, container } = mkGrid()
    grid.setSelection({
      activeCell: { rowIndex: 0, colIndex: 1 },
      anchorCell: { rowIndex: 0, colIndex: 1 },
      extentCell: { rowIndex: 1, colIndex: 1 },
      selectedRange: { startRow: 0, endRow: 1, startCol: 1, endCol: 1 },
    })

    const items = grid.getColumnHeaderContextMenuItems({ targetColIndex: 1 })
    const ids = items.map((item) => item.id)

    expect(ids).toContain('insert-col-left')
    expect(ids).toContain('insert-col-right')
    expect(ids).toContain('delete-cols')
    expect(ids).toContain('hide-cols')
    expect(ids).toContain('resize-column-width')
    expect(ids).not.toContain('unhide-cols')
    grid.destroy()
    container.remove()
  })

  it('invokeColumnHeaderContextMenuAction insert-col-left 触发 insertCols', () => {
    const { grid, data, container } = mkGrid()
    grid.setSelection({
      activeCell: { rowIndex: 0, colIndex: 1 },
      anchorCell: { rowIndex: 0, colIndex: 1 },
      extentCell: { rowIndex: 1, colIndex: 1 },
      selectedRange: { startRow: 0, endRow: 1, startCol: 1, endCol: 1 },
    })

    grid.invokeColumnHeaderContextMenuAction('insert-col-left', { targetColIndex: 1 })

    expect(data.getSchema().fields).toHaveLength(4)
    grid.destroy()
    container.remove()
  })

  it('选区跨 hidden gap 时 unhide-cols 项出现', () => {
    const { grid, container } = mkGrid()
    grid.hideCols(['b'])
    grid.setSelection({
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 1, colIndex: 1 },
      selectedRange: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
    })

    const items = grid.getColumnHeaderContextMenuItems({ targetColIndex: 0 })

    expect(items.map((item) => item.id)).toContain('unhide-cols')
    grid.destroy()
    container.remove()
  })
})
