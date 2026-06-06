import { describe, expect, it } from 'bun:test'

import { ColumnStructureUndoHandler } from '../../../src/engine/column/ColumnStructureUndoHandler'
import type { ColumnStructureUndoContext } from '../../../src/engine/column/ColumnStructureUndoHandler'
import type { Field } from '../../../src/kernel/data/Schema'
import type { RemovedFieldSnapshot } from '../../../src/kernel/data/MutableDataSource'
import type { FrozenConfig } from '../../../src/kernel/geometry/FrozenRegions'
import type { FormatLayer } from '../../../src/format/CellFormat'
import type { MergeRegion } from '../../../src/merge/MergeStore'
import type { GridSelection } from '../../../src/engine/selection/SelectionTypes'
import type { UndoCommand } from '../../../src/kernel/undo/UndoCommand'

type Call =
  | { op: 'reinsert'; snapshots: readonly RemovedFieldSnapshot[]; widths: readonly number[] }
  | { op: 'removeByIds'; ids: readonly string[] }
  | { op: 'insertAt'; at: number; fields: readonly Field[]; widths: readonly number[] }
  | { op: 'move'; fieldIds: readonly string[]; beforeFieldId: string | null; selection: GridSelection }
  | { op: 'frozen'; config: FrozenConfig }
  | { op: 'rebuild' }
  | { op: 'format'; layers: readonly FormatLayer[] }
  | { op: 'merge'; regions: readonly MergeRegion[] }
  | { op: 'selection'; selection: GridSelection }

function makeContext(): { ctx: ColumnStructureUndoContext; calls: Call[] } {
  const calls: Call[] = []
  const ctx: ColumnStructureUndoContext = {
    reinsertCols: (snapshots, widths) => calls.push({ op: 'reinsert', snapshots, widths }),
    removeFieldsByIds: (ids) => calls.push({ op: 'removeByIds', ids }),
    insertFieldsAt: (at, fields, widths) => calls.push({ op: 'insertAt', at, fields, widths }),
    replayMoveCols: (fieldIds, beforeFieldId, selection) =>
      calls.push({ op: 'move', fieldIds, beforeFieldId, selection }),
    restoreFrozen: (config) => calls.push({ op: 'frozen', config }),
    rebuildCols: () => calls.push({ op: 'rebuild' }),
    restoreFormat: (layers) => calls.push({ op: 'format', layers }),
    restoreMerge: (regions) => calls.push({ op: 'merge', regions }),
    restoreSelection: (selection) => calls.push({ op: 'selection', selection }),
  }
  return { ctx, calls }
}

const selBefore: GridSelection = {
  activeCell: null,
  anchorCell: null,
  extentCell: null,
  selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
}
const selAfter: GridSelection = {
  activeCell: null,
  anchorCell: null,
  extentCell: null,
  selectedRange: { startRow: 0, endRow: 0, startCol: 1, endCol: 1 },
}
const frozenB: FrozenConfig = { topRows: 0, leftCols: 1, rightCols: 0 }
const frozenA: FrozenConfig = { topRows: 0, leftCols: 0, rightCols: 0 }
const fmtB: readonly FormatLayer[] = []
const fmtA: readonly FormatLayer[] = []
const mrgB: readonly MergeRegion[] = []
const mrgA: readonly MergeRegion[] = []
const newField: Field = { id: 'n', name: 'N', type: 'text', width: 120 }

describe('ColumnStructureUndoHandler（次序：结构→frozen→rebuild→选区→format→merge）', () => {
  it('domain 为 columnStructure，仅 handles insert/delete/move 列', () => {
    const { ctx } = makeContext()
    const handler = new ColumnStructureUndoHandler(ctx)
    expect(handler.domain).toBe('columnStructure')
    expect(handler.handles('insertCols')).toBe(true)
    expect(handler.handles('deleteCols')).toBe(true)
    expect(handler.handles('moveCols')).toBe(true)
    expect(handler.handles('resizeColumn')).toBe(false)
    expect(handler.handles('insertRows')).toBe(false)
    expect(handler.handles('fill')).toBe(false)
  })

  describe('insertCols', () => {
    const cmd: UndoCommand = {
      kind: 'insertCols',
      at: 1,
      count: 1,
      newFields: [newField],
      selectionBefore: selBefore,
      selectionAfter: selAfter,
      frozenBefore: frozenB,
      frozenAfter: frozenA,
      formatBefore: fmtB,
      formatAfter: fmtA,
      mergeBefore: mrgB,
      mergeAfter: mrgA,
    }

    it('undo 移除新增字段 + frozenBefore', () => {
      const { ctx, calls } = makeContext()
      new ColumnStructureUndoHandler(ctx).applyUndo(cmd)
      expect(calls).toEqual([
        { op: 'removeByIds', ids: ['n'] },
        { op: 'frozen', config: frozenB },
        { op: 'rebuild' },
        { op: 'selection', selection: selBefore },
        { op: 'format', layers: fmtB },
        { op: 'merge', regions: mrgB },
      ])
    })

    it('redo 插入字段(用 field.width 作宽度) + frozenAfter', () => {
      const { ctx, calls } = makeContext()
      new ColumnStructureUndoHandler(ctx).applyRedo(cmd)
      expect(calls).toEqual([
        { op: 'insertAt', at: 1, fields: [newField], widths: [120] },
        { op: 'frozen', config: frozenA },
        { op: 'rebuild' },
        { op: 'selection', selection: selAfter },
        { op: 'format', layers: fmtA },
        { op: 'merge', regions: mrgA },
      ])
    })
  })

  describe('deleteCols', () => {
    const snapshots: RemovedFieldSnapshot[] = [
      { originalIndex: 1, field: newField, cells: ['A1', 'A2'] },
    ]
    const cmd: UndoCommand = {
      kind: 'deleteCols',
      snapshots,
      deletedWidths: [120],
      selectionBefore: selBefore,
      selectionAfter: selAfter,
      frozenBefore: frozenB,
      frozenAfter: frozenA,
      formatBefore: fmtB,
      formatAfter: fmtA,
      mergeBefore: mrgB,
      mergeAfter: mrgA,
    }

    it('undo 重新插入删除的列 + frozenBefore', () => {
      const { ctx, calls } = makeContext()
      new ColumnStructureUndoHandler(ctx).applyUndo(cmd)
      expect(calls).toEqual([
        { op: 'reinsert', snapshots, widths: [120] },
        { op: 'frozen', config: frozenB },
        { op: 'rebuild' },
        { op: 'selection', selection: selBefore },
        { op: 'format', layers: fmtB },
        { op: 'merge', regions: mrgB },
      ])
    })

    it('redo 按 snapshots.field.id 移除 + frozenAfter', () => {
      const { ctx, calls } = makeContext()
      new ColumnStructureUndoHandler(ctx).applyRedo(cmd)
      expect(calls).toEqual([
        { op: 'removeByIds', ids: ['n'] },
        { op: 'frozen', config: frozenA },
        { op: 'rebuild' },
        { op: 'selection', selection: selAfter },
        { op: 'format', layers: fmtA },
        { op: 'merge', regions: mrgA },
      ])
    })
  })

  describe('moveCols（replayMoveCols 内部已 rebuild + 选区）', () => {
    const cmd: UndoCommand = {
      kind: 'moveCols',
      fieldIds: ['a', 'b'],
      beforeFieldId: 'd',
      inverseBeforeFieldId: null,
      selectionBefore: selBefore,
      selectionAfter: selAfter,
      formatBefore: fmtB,
      formatAfter: fmtA,
      mergeBefore: mrgB,
      mergeAfter: mrgA,
    }

    it('undo 用 inverseBeforeFieldId + selectionBefore', () => {
      const { ctx, calls } = makeContext()
      new ColumnStructureUndoHandler(ctx).applyUndo(cmd)
      expect(calls).toEqual([
        { op: 'move', fieldIds: ['a', 'b'], beforeFieldId: null, selection: selBefore },
        { op: 'format', layers: fmtB },
        { op: 'merge', regions: mrgB },
      ])
    })

    it('redo 用 beforeFieldId + selectionAfter', () => {
      const { ctx, calls } = makeContext()
      new ColumnStructureUndoHandler(ctx).applyRedo(cmd)
      expect(calls).toEqual([
        { op: 'move', fieldIds: ['a', 'b'], beforeFieldId: 'd', selection: selAfter },
        { op: 'format', layers: fmtA },
        { op: 'merge', regions: mrgA },
      ])
    })
  })
})
