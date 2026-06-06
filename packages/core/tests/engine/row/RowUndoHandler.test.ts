import { describe, expect, it } from 'bun:test'

import { RowUndoHandler } from '../../../src/engine/row/RowUndoHandler'
import type { RowUndoContext } from '../../../src/engine/row/RowUndoHandler'
import type { GridSelection } from '../../../src/engine/selection/SelectionTypes'
import type { UndoCommand } from '../../../src/kernel/undo/UndoCommand'

type Call =
  | { op: 'setRowHeight'; rowIndex: number; height: number }
  | { op: 'setRowHeightsMulti'; rowIds: readonly number[]; height: number }
  | { op: 'addHidden'; ids: readonly number[] }
  | { op: 'removeHidden'; ids: readonly number[] }
  | { op: 'rebuild' }
  | { op: 'selection'; selection: GridSelection }

const DEFAULT_ROW_HEIGHT = 24

function makeRecordingContext(): { ctx: RowUndoContext; calls: Call[] } {
  const calls: Call[] = []
  const ctx: RowUndoContext = {
    setRowHeight: (rowIndex, height) => calls.push({ op: 'setRowHeight', rowIndex, height }),
    setRowHeightsMulti: (rowIds, height) => calls.push({ op: 'setRowHeightsMulti', rowIds, height }),
    addHiddenRows: (ids) => calls.push({ op: 'addHidden', ids }),
    removeHiddenRows: (ids) => calls.push({ op: 'removeHidden', ids }),
    rebuildRows: () => calls.push({ op: 'rebuild' }),
    restoreSelection: (selection) => calls.push({ op: 'selection', selection }),
    resolveDefaultRowHeight: () => DEFAULT_ROW_HEIGHT,
  }
  return { ctx, calls }
}

const selBefore: GridSelection = {
  activeCell: { rowIndex: 0, colIndex: 0 },
  anchorCell: { rowIndex: 0, colIndex: 0 },
  extentCell: { rowIndex: 0, colIndex: 0 },
  selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
}
const selAfter: GridSelection = {
  activeCell: { rowIndex: 1, colIndex: 1 },
  anchorCell: { rowIndex: 1, colIndex: 1 },
  extentCell: { rowIndex: 1, colIndex: 1 },
  selectedRange: { startRow: 1, endRow: 1, startCol: 1, endCol: 1 },
}

describe('RowUndoHandler', () => {
  it('domain 为 row，仅 handles 4 个行结构 kind', () => {
    const { ctx } = makeRecordingContext()
    const handler = new RowUndoHandler(ctx)
    expect(handler.domain).toBe('row')
    expect(handler.handles('resizeRow')).toBe(true)
    expect(handler.handles('resizeRowsMulti')).toBe(true)
    expect(handler.handles('hideRows')).toBe(true)
    expect(handler.handles('unhideRows')).toBe(true)
    expect(handler.handles('resizeColumn')).toBe(false)
    expect(handler.handles('hideCols')).toBe(false)
    expect(handler.handles('editCell')).toBe(false)
    expect(handler.handles('moveRows')).toBe(false)
  })

  describe('resizeRow（无选区恢复，undo/redo 均全重建）', () => {
    const cmd: UndoCommand = { kind: 'resizeRow', rowIndex: 3, before: 24, after: 48 }

    it('undo 写 before 高度 + rebuild，不恢复选区', () => {
      const { ctx, calls } = makeRecordingContext()
      new RowUndoHandler(ctx).applyUndo(cmd)
      expect(calls).toEqual([
        { op: 'setRowHeight', rowIndex: 3, height: 24 },
        { op: 'rebuild' },
      ])
    })

    it('redo 写 after 高度 + rebuild（修 bug：redo 也全重建），不恢复选区', () => {
      const { ctx, calls } = makeRecordingContext()
      new RowUndoHandler(ctx).applyRedo(cmd)
      expect(calls).toEqual([
        { op: 'setRowHeight', rowIndex: 3, height: 48 },
        { op: 'rebuild' },
      ])
    })
  })

  describe('resizeRowsMulti', () => {
    const cmd: UndoCommand = {
      kind: 'resizeRowsMulti',
      rowIds: [0, 2],
      oldHeights: [24, 30],
      newHeight: 50,
      selectionBefore: selBefore,
      selectionAfter: selAfter,
    }

    it('undo 逐行写回 oldHeights + rebuild + selectionBefore', () => {
      const { ctx, calls } = makeRecordingContext()
      new RowUndoHandler(ctx).applyUndo(cmd)
      expect(calls).toEqual([
        { op: 'setRowHeight', rowIndex: 0, height: 24 },
        { op: 'setRowHeight', rowIndex: 2, height: 30 },
        { op: 'rebuild' },
        { op: 'selection', selection: selBefore },
      ])
    })

    it('undo 时 oldHeights 缺项回退 resolveDefaultRowHeight', () => {
      const { ctx, calls } = makeRecordingContext()
      const sparse: UndoCommand = {
        kind: 'resizeRowsMulti',
        rowIds: [0, 2],
        oldHeights: [24],
        newHeight: 50,
        selectionBefore: selBefore,
        selectionAfter: selAfter,
      }
      new RowUndoHandler(ctx).applyUndo(sparse)
      expect(calls).toEqual([
        { op: 'setRowHeight', rowIndex: 0, height: 24 },
        { op: 'setRowHeight', rowIndex: 2, height: DEFAULT_ROW_HEIGHT },
        { op: 'rebuild' },
        { op: 'selection', selection: selBefore },
      ])
    })

    it('redo 批量写 newHeight + rebuild + selectionAfter', () => {
      const { ctx, calls } = makeRecordingContext()
      new RowUndoHandler(ctx).applyRedo(cmd)
      expect(calls).toEqual([
        { op: 'setRowHeightsMulti', rowIds: [0, 2], height: 50 },
        { op: 'rebuild' },
        { op: 'selection', selection: selAfter },
      ])
    })
  })

  describe('hideRows', () => {
    const cmd: UndoCommand = {
      kind: 'hideRows',
      underlyingRowIds: [1, 4],
      selectionBefore: selBefore,
      selectionAfter: selAfter,
    }

    it('undo removeHidden + rebuild + selectionBefore', () => {
      const { ctx, calls } = makeRecordingContext()
      new RowUndoHandler(ctx).applyUndo(cmd)
      expect(calls).toEqual([
        { op: 'removeHidden', ids: [1, 4] },
        { op: 'rebuild' },
        { op: 'selection', selection: selBefore },
      ])
    })

    it('redo addHidden + rebuild + selectionAfter', () => {
      const { ctx, calls } = makeRecordingContext()
      new RowUndoHandler(ctx).applyRedo(cmd)
      expect(calls).toEqual([
        { op: 'addHidden', ids: [1, 4] },
        { op: 'rebuild' },
        { op: 'selection', selection: selAfter },
      ])
    })
  })

  describe('unhideRows', () => {
    const cmd: UndoCommand = {
      kind: 'unhideRows',
      underlyingRowIds: [1, 4],
      selectionBefore: selBefore,
      selectionAfter: selAfter,
    }

    it('undo addHidden + rebuild + selectionBefore', () => {
      const { ctx, calls } = makeRecordingContext()
      new RowUndoHandler(ctx).applyUndo(cmd)
      expect(calls).toEqual([
        { op: 'addHidden', ids: [1, 4] },
        { op: 'rebuild' },
        { op: 'selection', selection: selBefore },
      ])
    })

    it('redo removeHidden + rebuild + selectionAfter', () => {
      const { ctx, calls } = makeRecordingContext()
      new RowUndoHandler(ctx).applyRedo(cmd)
      expect(calls).toEqual([
        { op: 'removeHidden', ids: [1, 4] },
        { op: 'rebuild' },
        { op: 'selection', selection: selAfter },
      ])
    })
  })
})
