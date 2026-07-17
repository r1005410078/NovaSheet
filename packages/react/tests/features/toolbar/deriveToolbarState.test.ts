import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine, InMemoryDataSource } from '@zhiguang/core'

import { deriveToolbarStateFromGrid, type ToolbarStateGridAccess } from '../../../src/features/toolbar'

function makeEngine() {
  const data = new InMemoryDataSource({
    schema: {
      fields: [
        { id: 'a', name: 'A', type: 'text', width: 100 },
        { id: 'b', name: 'B', type: 'text', width: 100 },
      ],
    },
    rows: [{ a: 'A1', b: 'B1' }, { a: 'A2', b: 'B2' }],
  })
  return new DefaultGridEngine({ data })
}

describe('deriveToolbarStateFromGrid', () => {
  it('reflects active cell fill, borders, text wrap, and merge state', () => {
    const engine = makeEngine()
    const range = { startRow: 0, endRow: 1, startCol: 0, endCol: 1 }

    engine.setSelection({
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 0, colIndex: 0 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
    })

    engine.setFillColor(range, '#ea4335')
    engine.setBorders(range, 'all', { color: '#ffffff', width: 'thin', lineStyle: 'solid' })
    engine.setTextWrap(range, 'wrap')
    engine.mergeCells(range)

    engine.setSelection({
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 1, colIndex: 1 },
      selectedRange: range,
    })

    const gridLike: ToolbarStateGridAccess = {
      getSelection: () => engine.getSelection(),
      getViewCellFormat: (row, col) => engine.getViewCellFormat(row, col),
      getViewMergeRegion: (row, col) => engine.getViewMergeRegion(row, col),
      canUndo: () => engine.canUndo(),
      canRedo: () => engine.canRedo(),
    }

    expect(deriveToolbarStateFromGrid(gridLike)).toEqual({
      fillColor: '#ea4335',
      borderStyle: { color: '#ffffff', width: 'thin', lineStyle: 'solid' },
      lastBorderPreset: 'all',
      textWrap: '换行',
      cellsMerged: true,
    })
  })

  it('clears toolbar format state for an unformatted cell', () => {
    const engine = makeEngine()

    engine.setSelection({
      activeCell: { rowIndex: 1, colIndex: 1 },
      anchorCell: { rowIndex: 1, colIndex: 1 },
      extentCell: { rowIndex: 1, colIndex: 1 },
      selectedRange: { startRow: 1, endRow: 1, startCol: 1, endCol: 1 },
    })

    const gridLike: ToolbarStateGridAccess = {
      getSelection: () => engine.getSelection(),
      getViewCellFormat: (row, col) => engine.getViewCellFormat(row, col),
      getViewMergeRegion: (row, col) => engine.getViewMergeRegion(row, col),
      canUndo: () => engine.canUndo(),
      canRedo: () => engine.canRedo(),
    }

    expect(deriveToolbarStateFromGrid(gridLike)).toEqual({
      fillColor: null,
      textWrap: '溢出',
      cellsMerged: false,
    })
  })
})
