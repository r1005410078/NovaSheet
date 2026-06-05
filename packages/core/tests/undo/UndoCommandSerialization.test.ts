import { describe, it } from 'bun:test'
import type { UndoCommand, CellWrite } from '../../src/undo/UndoCommand'
import type { FormatLayer } from '../../src/format/CellFormat'
import type { MergeRegion } from '../../src/merge/MergeStore'
import type { GridSelection } from '../../src/engine/selection/SelectionTypes'
import { assertSerializable } from '../helpers/undo-serialization'

const SELECTION: GridSelection = {
  activeCell: { rowIndex: 0, colIndex: 0 },
  anchorCell: { rowIndex: 0, colIndex: 0 },
  extentCell: { rowIndex: 1, colIndex: 1 },
  selectedRange: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
}
const SELECTION_AFTER: GridSelection = {
  activeCell: { rowIndex: 2, colIndex: 2 },
  anchorCell: { rowIndex: 2, colIndex: 2 },
  extentCell: { rowIndex: 2, colIndex: 2 },
  selectedRange: { startRow: 2, endRow: 2, startCol: 2, endCol: 2 },
}

describe('UndoCommand 序列化 round-trip', () => {
  it('editCell — string 值 round-trip', () => {
    const cmd: UndoCommand = {
      kind: 'editCell',
      rowIndex: 0,
      fieldId: 'name',
      before: 'Alice',
      after: 'Bob',
    }
    assertSerializable(cmd)
  })

  it('editCell — number 值 round-trip', () => {
    const cmd: UndoCommand = {
      kind: 'editCell',
      rowIndex: 5,
      fieldId: 'age',
      before: 30,
      after: 31,
    }
    assertSerializable(cmd)
  })

  it('editCell — null 值 round-trip', () => {
    const cmd: UndoCommand = {
      kind: 'editCell',
      rowIndex: 2,
      fieldId: 'note',
      before: null,
      after: null,
    }
    assertSerializable(cmd)
  })

  it('clearRange round-trip', () => {
    const before: CellWrite[] = [
      { rowIndex: 0, fieldId: 'name', value: 'Alice' },
      { rowIndex: 1, fieldId: 'name', value: 'Bob' },
      { rowIndex: 0, fieldId: 'age', value: 25 },
    ]
    const cmd: UndoCommand = {
      kind: 'clearRange',
      range: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
      before,
    }
    assertSerializable(cmd)
  })

  it('paste round-trip', () => {
    const before: CellWrite[] = [
      { rowIndex: 0, fieldId: 'name', value: 'OldName' },
      { rowIndex: 0, fieldId: 'age', value: 20 },
    ]
    const after: CellWrite[] = [
      { rowIndex: 0, fieldId: 'name', value: 'NewName' },
      { rowIndex: 0, fieldId: 'age', value: 99 },
    ]
    const cmd: UndoCommand = {
      kind: 'paste',
      target: { startRow: 0, endRow: 0, startCol: 0, endCol: 1 },
      before,
      after,
    }
    assertSerializable(cmd)
  })

  it('format round-trip', () => {
    const before: FormatLayer[] = [
      { range: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 }, patch: { fillColor: '#ffffff' }, order: 0 },
    ]
    const after: FormatLayer[] = [
      {
        range: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
        patch: { fillColor: '#ff0000', textWrap: 'wrap' },
        clearBorders: true,
        order: 1,
      },
    ]
    const cmd: UndoCommand = {
      kind: 'format',
      before,
      after,
      selectionBefore: SELECTION,
      selectionAfter: SELECTION_AFTER,
    }
    assertSerializable(cmd)
  })

  it('merge round-trip', () => {
    const before: MergeRegion[] = []
    const after: MergeRegion[] = [
      {
        id: 'm1',
        range: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
        anchor: { rowIndex: 0, colIndex: 0 },
      },
    ]
    const cmd: UndoCommand = {
      kind: 'merge',
      before,
      after,
      selectionBefore: SELECTION,
      selectionAfter: SELECTION_AFTER,
    }
    assertSerializable(cmd)
  })

  it('unmerge round-trip', () => {
    const before: MergeRegion[] = [
      {
        id: 'm1',
        range: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
        anchor: { rowIndex: 0, colIndex: 0 },
      },
    ]
    const after: MergeRegion[] = []
    const cmd: UndoCommand = {
      kind: 'unmerge',
      before,
      after,
      selectionBefore: SELECTION,
      selectionAfter: SELECTION_AFTER,
    }
    assertSerializable(cmd)
  })

  it('resizeRow round-trip', () => {
    const cmd: UndoCommand = { kind: 'resizeRow', rowIndex: 3, before: 24, after: 48 }
    assertSerializable(cmd)
  })

  it('resizeColumn round-trip', () => {
    const cmd: UndoCommand = { kind: 'resizeColumn', colIndex: 2, before: 80, after: 160 }
    assertSerializable(cmd)
  })

  it('resizeRowsMulti round-trip', () => {
    const cmd: UndoCommand = {
      kind: 'resizeRowsMulti',
      rowIds: [0, 2, 5],
      oldHeights: [24, 24, 30],
      newHeight: 40,
      selectionBefore: SELECTION,
      selectionAfter: SELECTION_AFTER,
    }
    assertSerializable(cmd)
  })

  it('resizeColumnsMulti round-trip', () => {
    const cmd: UndoCommand = {
      kind: 'resizeColumnsMulti',
      fieldIds: ['a', 'b'],
      oldWidths: [80, 100],
      newWidth: 120,
      selectionBefore: SELECTION,
      selectionAfter: SELECTION_AFTER,
    }
    assertSerializable(cmd)
  })

  it('hideRows round-trip', () => {
    const cmd: UndoCommand = {
      kind: 'hideRows',
      underlyingRowIds: [1, 4, 7],
      selectionBefore: SELECTION,
      selectionAfter: SELECTION_AFTER,
    }
    assertSerializable(cmd)
  })

  it('unhideRows round-trip', () => {
    const cmd: UndoCommand = {
      kind: 'unhideRows',
      underlyingRowIds: [1, 4, 7],
      selectionBefore: SELECTION,
      selectionAfter: SELECTION_AFTER,
    }
    assertSerializable(cmd)
  })

  it('hideCols round-trip', () => {
    const cmd: UndoCommand = {
      kind: 'hideCols',
      fieldIds: ['a', 'c'],
      selectionBefore: SELECTION,
      selectionAfter: SELECTION_AFTER,
    }
    assertSerializable(cmd)
  })

  it('unhideCols round-trip', () => {
    const cmd: UndoCommand = {
      kind: 'unhideCols',
      fieldIds: ['a', 'c'],
      selectionBefore: SELECTION,
      selectionAfter: SELECTION_AFTER,
    }
    assertSerializable(cmd)
  })
})
