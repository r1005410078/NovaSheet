import { describe, expect, it } from 'bun:test'

import { RowStructureUndoHandler } from '../../../src/features/row/RowStructureUndoHandler'
import type { RowStructureUndoContext } from '../../../src/features/row/RowStructureUndoHandler'
import type { DeletedRowSnapshot } from '../../../src/kernel/data/MutableDataSource'
import type { FormatLayer } from '../../../src/kernel/protocol/FormatTypes'
import type { MergeRegion } from '../../../src/features/merge/MergeStore'
import type { GridSelection } from '../../../src/kernel/coords/SelectionTypes'
import type { UndoCommand } from '../../../src/kernel/undo/UndoCommand'

type Call =
  | { op: 'deleteByIds'; ids: readonly number[] }
  | { op: 'insertBlank'; at: number; count: number }
  | { op: 'reinsert'; snapshots: readonly DeletedRowSnapshot[]; heights: readonly number[] }
  | { op: 'move'; rowIds: readonly number[]; beforeRowId: number | null; selection: GridSelection }
  | { op: 'rebuild' }
  | { op: 'format'; layers: readonly FormatLayer[] }
  | { op: 'merge'; regions: readonly MergeRegion[] }
  | { op: 'selection'; selection: GridSelection }

function makeContext(overrides: Partial<RowStructureUndoContext> = {}): {
  ctx: RowStructureUndoContext
  calls: Call[]
} {
  const calls: Call[] = []
  const ctx: RowStructureUndoContext = {
    canInsertRows: () => true,
    canDeleteRows: () => true,
    deleteRowsByIds: (ids) => calls.push({ op: 'deleteByIds', ids }),
    insertBlankRows: (at, count) => calls.push({ op: 'insertBlank', at, count }),
    reinsertRows: (snapshots, heights) => calls.push({ op: 'reinsert', snapshots, heights }),
    replayMoveRows: (rowIds, beforeRowId, selection) =>
      calls.push({ op: 'move', rowIds, beforeRowId, selection }),
    rebuildRows: () => calls.push({ op: 'rebuild' }),
    restoreFormat: (layers) => calls.push({ op: 'format', layers }),
    restoreMerge: (regions) => calls.push({ op: 'merge', regions }),
    restoreSelection: (selection) => calls.push({ op: 'selection', selection }),
    ...overrides,
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
  selectedRange: { startRow: 1, endRow: 1, startCol: 0, endCol: 0 },
}
const fmtB: readonly FormatLayer[] = []
const fmtA: readonly FormatLayer[] = []
const mrgB: readonly MergeRegion[] = []
const mrgA: readonly MergeRegion[] = []

describe('RowStructureUndoHandler', () => {
  it('domain 为 rowStructure，仅 handles insert/delete/move 行', () => {
    const { ctx } = makeContext()
    const handler = new RowStructureUndoHandler(ctx)
    expect(handler.domain).toBe('rowStructure')
    expect(handler.handles('insertRows')).toBe(true)
    expect(handler.handles('deleteRows')).toBe(true)
    expect(handler.handles('moveRows')).toBe(true)
    expect(handler.handles('resizeRow')).toBe(false)
    expect(handler.handles('insertCols')).toBe(false)
    expect(handler.handles('fill')).toBe(false)
  })

  describe('insertRows（结构→rebuild→format→merge→选区）', () => {
    const cmd: UndoCommand = {
      kind: 'insertRows',
      at: 2,
      count: 2,
      newIds: [2, 3],
      selectionBefore: selBefore,
      selectionAfter: selAfter,
      formatBefore: fmtB,
      formatAfter: fmtA,
      mergeBefore: mrgB,
      mergeAfter: mrgA,
    }

    it('undo 删除插入的行(at..at+count-1)', () => {
      const { ctx, calls } = makeContext()
      new RowStructureUndoHandler(ctx).applyUndo(cmd)
      expect(calls).toEqual([
        { op: 'deleteByIds', ids: [2, 3] },
        { op: 'rebuild' },
        { op: 'format', layers: fmtB },
        { op: 'merge', regions: mrgB },
        { op: 'selection', selection: selBefore },
      ])
    })

    it('undo 在不支持 deleteRows 时整支 no-op', () => {
      const { ctx, calls } = makeContext({ canDeleteRows: () => false })
      new RowStructureUndoHandler(ctx).applyUndo(cmd)
      expect(calls).toEqual([])
    })

    it('redo 插入空白行', () => {
      const { ctx, calls } = makeContext()
      new RowStructureUndoHandler(ctx).applyRedo(cmd)
      expect(calls).toEqual([
        { op: 'insertBlank', at: 2, count: 2 },
        { op: 'rebuild' },
        { op: 'format', layers: fmtA },
        { op: 'merge', regions: mrgA },
        { op: 'selection', selection: selAfter },
      ])
    })

    it('redo 在不支持 insertRows 时整支 no-op', () => {
      const { ctx, calls } = makeContext({ canInsertRows: () => false })
      new RowStructureUndoHandler(ctx).applyRedo(cmd)
      expect(calls).toEqual([])
    })
  })

  describe('deleteRows', () => {
    const snapshots: DeletedRowSnapshot[] = [
      { originalUnderlyingRow: 5, cells: { a: 'A6' } },
      { originalUnderlyingRow: 1, cells: { a: 'A2' } },
    ]
    const cmd: UndoCommand = {
      kind: 'deleteRows',
      snapshots,
      deletedHeights: [30, 24],
      selectionBefore: selBefore,
      selectionAfter: selAfter,
      formatBefore: fmtB,
      formatAfter: fmtA,
      mergeBefore: mrgB,
      mergeAfter: mrgA,
    }

    it('undo 重新插入删除的行', () => {
      const { ctx, calls } = makeContext()
      new RowStructureUndoHandler(ctx).applyUndo(cmd)
      expect(calls).toEqual([
        { op: 'reinsert', snapshots, heights: [30, 24] },
        { op: 'rebuild' },
        { op: 'format', layers: fmtB },
        { op: 'merge', regions: mrgB },
        { op: 'selection', selection: selBefore },
      ])
    })

    it('redo 按 originalUnderlyingRow 升序删除', () => {
      const { ctx, calls } = makeContext()
      new RowStructureUndoHandler(ctx).applyRedo(cmd)
      expect(calls).toEqual([
        { op: 'deleteByIds', ids: [1, 5] },
        { op: 'rebuild' },
        { op: 'format', layers: fmtA },
        { op: 'merge', regions: mrgA },
        { op: 'selection', selection: selAfter },
      ])
    })
  })

  describe('moveRows（无 rebuild：replayMoveRows 内部已 rebuild + 选区）', () => {
    const cmd: UndoCommand = {
      kind: 'moveRows',
      rowIds: [2, 3],
      beforeRowId: 6,
      inverseRowIds: [4, 5],
      inverseBeforeRowId: 1,
      selectionBefore: selBefore,
      selectionAfter: selAfter,
      formatBefore: fmtB,
      formatAfter: fmtA,
      mergeBefore: mrgB,
      mergeAfter: mrgA,
    }

    it('undo 用 inverse 行序 + selectionBefore', () => {
      const { ctx, calls } = makeContext()
      new RowStructureUndoHandler(ctx).applyUndo(cmd)
      expect(calls).toEqual([
        { op: 'move', rowIds: [4, 5], beforeRowId: 1, selection: selBefore },
        { op: 'format', layers: fmtB },
        { op: 'merge', regions: mrgB },
      ])
    })

    it('redo 用正向行序 + selectionAfter', () => {
      const { ctx, calls } = makeContext()
      new RowStructureUndoHandler(ctx).applyRedo(cmd)
      expect(calls).toEqual([
        { op: 'move', rowIds: [2, 3], beforeRowId: 6, selection: selAfter },
        { op: 'format', layers: fmtA },
        { op: 'merge', regions: mrgA },
      ])
    })
  })
})
