import { describe, it } from 'bun:test'
import type { UndoCommand, CellWrite } from '../../src/undo/UndoCommand'
import type { FormatLayer } from '../../src/format/CellFormat'
import type { MergeRegion } from '../../src/merge/MergeStore'
import type { GridSelection } from '../../src/engine/selection/SelectionTypes'
import type { Field } from '../../src/kernel/data/Schema'
import type { DeletedRowSnapshot, RemovedFieldSnapshot } from '../../src/kernel/data/MutableDataSource'
import type { FrozenConfig } from '../../src/kernel/geometry/FrozenRegions'
import { assertSerializable } from '../helpers/undo-serialization'

const FROZEN: FrozenConfig = { topRows: 0, leftCols: 0, rightCols: 0 }
const FIELD: Field = { id: 'x', name: 'X', type: 'text', width: 100 }

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

  it('fill round-trip（含可选 format/merge）', () => {
    const before: CellWrite[] = [{ rowIndex: 0, fieldId: 'a', value: 'x' }]
    const after: CellWrite[] = [{ rowIndex: 1, fieldId: 'a', value: 'x' }]
    const cmd: UndoCommand = {
      kind: 'fill',
      source: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
      fill: { startRow: 0, endRow: 1, startCol: 0, endCol: 0 },
      result: { startRow: 0, endRow: 1, startCol: 0, endCol: 0 },
      before,
      after,
      formatBefore: [],
      formatAfter: [{ range: { startRow: 1, endRow: 1, startCol: 0, endCol: 0 }, patch: { fillColor: '#fff' }, order: 0 }],
      mergeBefore: [],
      mergeAfter: [],
    }
    assertSerializable(cmd)
  })

  it('moveRows round-trip', () => {
    const cmd: UndoCommand = {
      kind: 'moveRows',
      rowIds: [2, 3],
      beforeRowId: 5,
      inverseRowIds: [2, 3],
      inverseBeforeRowId: 1,
      selectionBefore: SELECTION,
      selectionAfter: SELECTION_AFTER,
      formatBefore: [],
      formatAfter: [],
      mergeBefore: [],
      mergeAfter: [],
    }
    assertSerializable(cmd)
  })

  it('moveCols round-trip', () => {
    const cmd: UndoCommand = {
      kind: 'moveCols',
      fieldIds: ['a', 'b'],
      beforeFieldId: 'd',
      inverseBeforeFieldId: null,
      selectionBefore: SELECTION,
      selectionAfter: SELECTION_AFTER,
      formatBefore: [],
      formatAfter: [],
      mergeBefore: [],
      mergeAfter: [],
    }
    assertSerializable(cmd)
  })

  it('insertRows round-trip', () => {
    const cmd: UndoCommand = {
      kind: 'insertRows',
      at: 2,
      count: 1,
      newIds: [2],
      selectionBefore: SELECTION,
      selectionAfter: SELECTION_AFTER,
      formatBefore: [],
      formatAfter: [],
      mergeBefore: [],
      mergeAfter: [],
    }
    assertSerializable(cmd)
  })

  it('deleteRows round-trip', () => {
    const snapshots: DeletedRowSnapshot[] = [
      { originalUnderlyingRow: 1, cells: { a: 'A2', b: 'B2' } },
    ]
    const cmd: UndoCommand = {
      kind: 'deleteRows',
      snapshots,
      deletedHeights: [24],
      selectionBefore: SELECTION,
      selectionAfter: SELECTION_AFTER,
      formatBefore: [],
      formatAfter: [],
      mergeBefore: [],
      mergeAfter: [],
    }
    assertSerializable(cmd)
  })

  it('insertCols round-trip', () => {
    const cmd: UndoCommand = {
      kind: 'insertCols',
      at: 1,
      count: 1,
      newFields: [FIELD],
      selectionBefore: SELECTION,
      selectionAfter: SELECTION_AFTER,
      frozenBefore: FROZEN,
      frozenAfter: FROZEN,
      formatBefore: [],
      formatAfter: [],
      mergeBefore: [],
      mergeAfter: [],
    }
    assertSerializable(cmd)
  })

  it('deleteCols round-trip（cells 用全 defined 值，避免 undefined→null 不对称）', () => {
    // 注：RemovedFieldSnapshot.cells 是 (CellValue | undefined)[]，真实空单元格的 undefined 经
    // JSON.stringify 会变 null → round-trip 不等。此处样例用全 defined 值守住「纯数据可序列化」；
    // undefined 归一化（视为 null）留作后续（与 spec 的 CellValue/Date 归一化同类发现）。
    const snapshots: RemovedFieldSnapshot[] = [
      { originalIndex: 1, field: FIELD, cells: ['A1', 'A2', 'A3'] },
    ]
    const cmd: UndoCommand = {
      kind: 'deleteCols',
      snapshots,
      deletedWidths: [100],
      selectionBefore: SELECTION,
      selectionAfter: SELECTION_AFTER,
      frozenBefore: FROZEN,
      frozenAfter: FROZEN,
      formatBefore: [],
      formatAfter: [],
      mergeBefore: [],
      mergeAfter: [],
    }
    assertSerializable(cmd)
  })
})
