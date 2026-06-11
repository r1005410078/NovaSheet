import { describe, it } from 'bun:test'

import type { Field } from '../../../../src'
import type { UndoCommand } from '../../../../src/kernel/undo/UndoCommand'
import { assertSerializable } from '../../../helpers/undo-serialization'
import { singleCellSelection } from '../../_helpers/fixtures'
import { expectGolden } from '../../_helpers/golden'

describe('Core acceptance undo', () => {
it('core.L0.undo-command-serialization roundtrips representative commands', () => {
    const selection = singleCellSelection(0, 0)
    assertSerializable({
      kind: 'editCell',
      rowIndex: 0,
      fieldId: 'name',
      before: 'Ada',
      after: 'Grace',
    })
    assertSerializable({
      kind: 'format',
      before: [],
      after: [
        {
          range: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
          patch: { fillColor: '#fff2cc' },
          order: 0,
        },
      ],
      selectionBefore: selection,
      selectionAfter: selection,
    })
  })

  it('core.L0.undo-command-shape-inventory locks field set of every UndoCommand kind', () => {
    // 共享 stub——值不入金，只用于枚举各 kind 字段集 + 验 JSON 可序列化。
    const sel = singleCellSelection(0, 0)
    const range = { startRow: 0, endRow: 0, startCol: 0, endCol: 0 } as const
    const frozen = { topRows: 0, leftCols: 0, rightCols: 0 } as const
    const field: Field = { id: 'x', name: 'X', type: 'text', width: 100 }
    const fmt: never[] = []
    const merge: never[] = []

    // 21 个 kind 各一个最小代表实例（全字段齐全）。增删改任一字段都会改变 key 列表 → diff。
    const commands: readonly UndoCommand[] = [
      { kind: 'editCell', rowIndex: 0, fieldId: 'x', before: null, after: 'v' },
      { kind: 'clearRange', range, before: [{ rowIndex: 0, fieldId: 'x', value: 'v' }] },
      { kind: 'paste', target: range, before: [], after: [] },
      // fill 的 format/merge 字段可选（仅 raw 连续时填充）；shape inventory 锁全部可能字段。
      { kind: 'fill', source: range, fill: range, result: range, before: [], after: [], formatBefore: fmt, formatAfter: fmt, mergeBefore: merge, mergeAfter: merge },
      { kind: 'resizeRow', rowIndex: 0, before: 28, after: 40 },
      { kind: 'resizeColumn', colIndex: 0, before: 100, after: 120 },
      { kind: 'insertRows', at: 0, count: 1, newIds: [9], selectionBefore: sel, selectionAfter: sel, formatBefore: fmt, formatAfter: fmt, mergeBefore: merge, mergeAfter: merge },
      { kind: 'deleteRows', snapshots: [{ originalUnderlyingRow: 0, cells: { x: 'v' } }], deletedHeights: [28], selectionBefore: sel, selectionAfter: sel, formatBefore: fmt, formatAfter: fmt, mergeBefore: merge, mergeAfter: merge },
      { kind: 'hideRows', underlyingRowIds: [0], selectionBefore: sel, selectionAfter: sel },
      { kind: 'unhideRows', underlyingRowIds: [0], selectionBefore: sel, selectionAfter: sel },
      { kind: 'resizeRowsMulti', rowIds: [0], oldHeights: [28], newHeight: 40, selectionBefore: sel, selectionAfter: sel },
      { kind: 'moveRows', rowIds: [1], beforeRowId: 0, inverseRowIds: [1], inverseBeforeRowId: null, selectionBefore: sel, selectionAfter: sel, formatBefore: fmt, formatAfter: fmt, mergeBefore: merge, mergeAfter: merge },
      { kind: 'insertCols', at: 0, count: 1, newFields: [field], selectionBefore: sel, selectionAfter: sel, frozenBefore: frozen, frozenAfter: frozen, formatBefore: fmt, formatAfter: fmt, mergeBefore: merge, mergeAfter: merge },
      { kind: 'deleteCols', snapshots: [{ originalIndex: 0, field, cells: ['v'] }], deletedWidths: [100], selectionBefore: sel, selectionAfter: sel, frozenBefore: frozen, frozenAfter: frozen, formatBefore: fmt, formatAfter: fmt, mergeBefore: merge, mergeAfter: merge },
      { kind: 'hideCols', fieldIds: ['x'], selectionBefore: sel, selectionAfter: sel },
      { kind: 'unhideCols', fieldIds: ['x'], selectionBefore: sel, selectionAfter: sel },
      { kind: 'resizeColumnsMulti', fieldIds: ['x'], oldWidths: [100], newWidth: 120, selectionBefore: sel, selectionAfter: sel },
      { kind: 'moveCols', fieldIds: ['x'], beforeFieldId: null, inverseBeforeFieldId: null, selectionBefore: sel, selectionAfter: sel, formatBefore: fmt, formatAfter: fmt, mergeBefore: merge, mergeAfter: merge },
      { kind: 'format', before: [], after: [], selectionBefore: sel, selectionAfter: sel },
      { kind: 'merge', before: [], after: [], selectionBefore: sel, selectionAfter: sel },
      { kind: 'unmerge', before: [], after: [], selectionBefore: sel, selectionAfter: sel },
    ]

    const lines = commands.map((cmd) => {
      assertSerializable(cmd) // 每个 kind 都必须 JSON 往返无损
      const keys = Object.keys(cmd)
        .filter((k) => k !== 'kind')
        .sort()
      return `${cmd.kind}: ${keys.join(', ')}`
    })
    expectGolden(import.meta.dir, 'core.L0.undo-command-shape-inventory', `${lines.join('\n')}\n`)
  })
})
