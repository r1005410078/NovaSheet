import { describe, it } from 'bun:test'
import type { UndoCommand, CellWrite } from '../../src/undo/UndoCommand'
import { assertSerializable } from '../helpers/undo-serialization'

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
})
