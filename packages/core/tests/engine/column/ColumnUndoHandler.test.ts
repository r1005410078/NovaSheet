import { describe, expect, it } from 'bun:test'

import { ColumnUndoHandler } from '../../../src/engine/column/ColumnUndoHandler'
import type { ColumnUndoContext } from '../../../src/engine/column/ColumnUndoHandler'
import type { GridSelection } from '../../../src/engine/selection/SelectionTypes'
import type { UndoCommand } from '../../../src/undo/UndoCommand'

type Call =
  | { op: 'setColWidth'; colIndex: number; width: number }
  | { op: 'setColWidthById'; id: string; width: number }
  | { op: 'addHidden'; ids: readonly string[] }
  | { op: 'removeHidden'; ids: readonly string[] }
  | { op: 'rebuild' }
  | { op: 'selection'; selection: GridSelection }

const DEFAULT_COL_WIDTH = 80

function makeRecordingContext(): { ctx: ColumnUndoContext; calls: Call[] } {
  const calls: Call[] = []
  const ctx: ColumnUndoContext = {
    setColWidth: (colIndex, width) => calls.push({ op: 'setColWidth', colIndex, width }),
    setColWidthById: (id, width) => calls.push({ op: 'setColWidthById', id, width }),
    addHiddenCols: (ids) => calls.push({ op: 'addHidden', ids }),
    removeHiddenCols: (ids) => calls.push({ op: 'removeHidden', ids }),
    rebuildCols: () => calls.push({ op: 'rebuild' }),
    restoreSelection: (selection) => calls.push({ op: 'selection', selection }),
    getDefaultColWidth: () => DEFAULT_COL_WIDTH,
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

describe('ColumnUndoHandler', () => {
  it('domain 为 column，仅 handles 4 个列结构 kind', () => {
    const { ctx } = makeRecordingContext()
    const handler = new ColumnUndoHandler(ctx)
    expect(handler.domain).toBe('column')
    expect(handler.handles('resizeColumn')).toBe(true)
    expect(handler.handles('resizeColumnsMulti')).toBe(true)
    expect(handler.handles('hideCols')).toBe(true)
    expect(handler.handles('unhideCols')).toBe(true)
    expect(handler.handles('resizeRow')).toBe(false)
    expect(handler.handles('hideRows')).toBe(false)
    expect(handler.handles('editCell')).toBe(false)
    expect(handler.handles('moveCols')).toBe(false)
  })

  describe('resizeColumn（无选区恢复）', () => {
    const cmd: UndoCommand = { kind: 'resizeColumn', colIndex: 2, before: 80, after: 160 }

    it('undo 写 before 宽度 + rebuild，不恢复选区', () => {
      const { ctx, calls } = makeRecordingContext()
      new ColumnUndoHandler(ctx).applyUndo(cmd)
      expect(calls).toEqual([
        { op: 'setColWidth', colIndex: 2, width: 80 },
        { op: 'rebuild' },
      ])
    })

    it('redo 写 after 宽度 + rebuild，不恢复选区', () => {
      const { ctx, calls } = makeRecordingContext()
      new ColumnUndoHandler(ctx).applyRedo(cmd)
      expect(calls).toEqual([
        { op: 'setColWidth', colIndex: 2, width: 160 },
        { op: 'rebuild' },
      ])
    })
  })

  describe('resizeColumnsMulti', () => {
    const cmd: UndoCommand = {
      kind: 'resizeColumnsMulti',
      fieldIds: ['a', 'b'],
      oldWidths: [80, 100],
      newWidth: 140,
      selectionBefore: selBefore,
      selectionAfter: selAfter,
    }

    it('undo 逐列写回 oldWidths + rebuild + selectionBefore', () => {
      const { ctx, calls } = makeRecordingContext()
      new ColumnUndoHandler(ctx).applyUndo(cmd)
      expect(calls).toEqual([
        { op: 'setColWidthById', id: 'a', width: 80 },
        { op: 'setColWidthById', id: 'b', width: 100 },
        { op: 'rebuild' },
        { op: 'selection', selection: selBefore },
      ])
    })

    it('undo 时 oldWidths 缺项回退 getDefaultColWidth', () => {
      const { ctx, calls } = makeRecordingContext()
      const sparse: UndoCommand = {
        kind: 'resizeColumnsMulti',
        fieldIds: ['a', 'b'],
        oldWidths: [80],
        newWidth: 140,
        selectionBefore: selBefore,
        selectionAfter: selAfter,
      }
      new ColumnUndoHandler(ctx).applyUndo(sparse)
      expect(calls).toEqual([
        { op: 'setColWidthById', id: 'a', width: 80 },
        { op: 'setColWidthById', id: 'b', width: DEFAULT_COL_WIDTH },
        { op: 'rebuild' },
        { op: 'selection', selection: selBefore },
      ])
    })

    it('redo 逐列写 newWidth + rebuild + selectionAfter', () => {
      const { ctx, calls } = makeRecordingContext()
      new ColumnUndoHandler(ctx).applyRedo(cmd)
      expect(calls).toEqual([
        { op: 'setColWidthById', id: 'a', width: 140 },
        { op: 'setColWidthById', id: 'b', width: 140 },
        { op: 'rebuild' },
        { op: 'selection', selection: selAfter },
      ])
    })
  })

  describe('hideCols', () => {
    const cmd: UndoCommand = {
      kind: 'hideCols',
      fieldIds: ['a', 'c'],
      selectionBefore: selBefore,
      selectionAfter: selAfter,
    }

    it('undo removeHidden + rebuild + selectionBefore', () => {
      const { ctx, calls } = makeRecordingContext()
      new ColumnUndoHandler(ctx).applyUndo(cmd)
      expect(calls).toEqual([
        { op: 'removeHidden', ids: ['a', 'c'] },
        { op: 'rebuild' },
        { op: 'selection', selection: selBefore },
      ])
    })

    it('redo addHidden + rebuild + selectionAfter', () => {
      const { ctx, calls } = makeRecordingContext()
      new ColumnUndoHandler(ctx).applyRedo(cmd)
      expect(calls).toEqual([
        { op: 'addHidden', ids: ['a', 'c'] },
        { op: 'rebuild' },
        { op: 'selection', selection: selAfter },
      ])
    })
  })

  describe('unhideCols', () => {
    const cmd: UndoCommand = {
      kind: 'unhideCols',
      fieldIds: ['a', 'c'],
      selectionBefore: selBefore,
      selectionAfter: selAfter,
    }

    it('undo addHidden + rebuild + selectionBefore', () => {
      const { ctx, calls } = makeRecordingContext()
      new ColumnUndoHandler(ctx).applyUndo(cmd)
      expect(calls).toEqual([
        { op: 'addHidden', ids: ['a', 'c'] },
        { op: 'rebuild' },
        { op: 'selection', selection: selBefore },
      ])
    })

    it('redo removeHidden + rebuild + selectionAfter', () => {
      const { ctx, calls } = makeRecordingContext()
      new ColumnUndoHandler(ctx).applyRedo(cmd)
      expect(calls).toEqual([
        { op: 'removeHidden', ids: ['a', 'c'] },
        { op: 'rebuild' },
        { op: 'selection', selection: selAfter },
      ])
    })
  })
})
