import { describe, expect, it } from 'bun:test'
import type { DataSourceEvent } from '../src/data/DataSource'
import type {
  MutableDataSource,
  RemovedFieldSnapshot,
} from '../src/data/MutableDataSource'
import type { Field } from '../src/data/Schema'
import type { UndoCommand } from '../src/undo/UndoCommand'

const emptySelection = {
  activeCell: null,
  anchorCell: null,
  extentCell: null,
  selectedRange: null,
}

describe('Phase 4.6 type probes', () => {
  it('DataSourceEvent 含 colsInserted / colsDeleted', () => {
    const f: Field = { id: 'x', name: 'X', type: 'text', width: 100 }
    const inserted: DataSourceEvent = { type: 'colsInserted', at: 0, field: f }
    const deleted: DataSourceEvent = {
      type: 'colsDeleted',
      removed: [{ index: 0, fieldId: 'x' }],
    }
    expect(inserted.type).toBe('colsInserted')
    expect(deleted.type).toBe('colsDeleted')
  })

  it('MutableDataSource 含 optional insertField / removeField + RemovedFieldSnapshot', () => {
    const snap: RemovedFieldSnapshot = {
      originalIndex: 1,
      field: { id: 'x', name: 'X', type: 'text', width: 100 },
      cells: ['a', null, 'c'],
    }
    const ds: MutableDataSource = {
      getRowCount: () => 0,
      getSchema: () => ({ fields: [] }),
      getRows: () => [],
      getCell: () => undefined,
      subscribe: () => () => {},
      updateCell: () => {},
      insertField: (_at, f) => f,
      removeField: (_id) => snap,
    }
    expect(ds.insertField?.(0, snap.field)).toEqual(snap.field)
  })

  it('UndoCommand 含 5 个列结构 variant', () => {
    const field: Field = { id: 'x', name: 'X', type: 'text', width: 100 }
    const cmds: UndoCommand[] = [
      {
        kind: 'insertCols',
        at: 0,
        count: 1,
        newFields: [field],
        selectionBefore: emptySelection,
        selectionAfter: emptySelection,
        frozenBefore: { topRows: 0, leftCols: 0, rightCols: 0 },
        frozenAfter: { topRows: 0, leftCols: 0, rightCols: 0 },
      },
      {
        kind: 'deleteCols',
        snapshots: [{ originalIndex: 0, field, cells: ['a'] }],
        deletedWidths: [100],
        selectionBefore: emptySelection,
        selectionAfter: emptySelection,
        frozenBefore: { topRows: 0, leftCols: 0, rightCols: 0 },
        frozenAfter: { topRows: 0, leftCols: 0, rightCols: 0 },
        sortSpecBefore: null,
        filterSpecBefore: null,
      },
      {
        kind: 'hideCols',
        fieldIds: ['x'],
        selectionBefore: emptySelection,
        selectionAfter: emptySelection,
      },
      {
        kind: 'unhideCols',
        fieldIds: ['x'],
        selectionBefore: emptySelection,
        selectionAfter: emptySelection,
      },
      {
        kind: 'resizeColumnsMulti',
        fieldIds: ['x'],
        oldWidths: [100],
        newWidth: 120,
        selectionBefore: emptySelection,
        selectionAfter: emptySelection,
      },
    ]
    expect(cmds.map((cmd) => cmd.kind)).toEqual([
      'insertCols',
      'deleteCols',
      'hideCols',
      'unhideCols',
      'resizeColumnsMulti',
    ])
  })
})
