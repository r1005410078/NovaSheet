import { describe, expect, it } from 'bun:test'

import { FormatUndoHandler } from '../../../src/features/format/FormatUndoHandler'
import type { FormatUndoContext } from '../../../src/features/format/FormatUndoHandler'
import type { FormatLayer } from '../../../src/kernel/protocol/FormatTypes'
import type { MergeRegion } from '../../../src/features/merge/MergeStore'
import type { GridSelection } from '../../../src/kernel/coords/SelectionTypes'
import type { UndoCommand } from '../../../src/kernel/undo/UndoCommand'
import type { CellAttachmentSnapshot } from '../../../src/kernel/protocol/AttachmentTypes'

type RestoreFormatCall = { op: 'format'; layers: readonly FormatLayer[] }
type RestoreMergeCall = { op: 'merge'; regions: readonly MergeRegion[] }
type RestoreSelCall = { op: 'selection'; selection: GridSelection }
type RestoreAttachmentCall = { op: 'attachment'; snap: CellAttachmentSnapshot }
type Call = RestoreFormatCall | RestoreMergeCall | RestoreSelCall | RestoreAttachmentCall

function makeRecordingContext(): { ctx: FormatUndoContext; calls: Call[] } {
  const calls: Call[] = []
  const ctx: FormatUndoContext = {
    restoreFormat(layers) {
      calls.push({ op: 'format', layers })
    },
    restoreMerge(regions) {
      calls.push({ op: 'merge', regions })
    },
    restoreSelection(selection) {
      calls.push({ op: 'selection', selection })
    },
    restoreAttachments(snap) {
      calls.push({ op: 'attachment', snap })
    },
  }
  return { ctx, calls }
}

const selBefore: GridSelection = {
  activeCell: { rowIndex: 0, colIndex: 0 },
  anchorCell: { rowIndex: 0, colIndex: 0 },
  extentCell: { rowIndex: 1, colIndex: 1 },
  selectedRange: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
}
const selAfter: GridSelection = {
  activeCell: { rowIndex: 2, colIndex: 2 },
  anchorCell: { rowIndex: 2, colIndex: 2 },
  extentCell: { rowIndex: 2, colIndex: 2 },
  selectedRange: { startRow: 2, endRow: 2, startCol: 2, endCol: 2 },
}

const formatBefore: readonly FormatLayer[] = [
  { range: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 }, patch: { fillColor: '#aaa' }, order: 0 },
]
const formatAfter: readonly FormatLayer[] = [
  { range: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 }, patch: { fillColor: '#bbb' }, order: 1 },
]
const mergeBefore: readonly MergeRegion[] = []
const mergeAfter: readonly MergeRegion[] = [
  { id: 'm1', range: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 }, anchor: { rowIndex: 0, colIndex: 0 } },
]

describe('FormatUndoHandler', () => {
  it('domain 为 format，仅 handles format/merge/unmerge', () => {
    const { ctx } = makeRecordingContext()
    const handler = new FormatUndoHandler(ctx)
    expect(handler.domain).toBe('format')
    expect(handler.handles('format')).toBe(true)
    expect(handler.handles('merge')).toBe(true)
    expect(handler.handles('unmerge')).toBe(true)
    expect(handler.handles('editCell')).toBe(false)
    expect(handler.handles('fill')).toBe(false)
    expect(handler.handles('resizeRow')).toBe(false)
  })

  describe('format', () => {
    const cmd: UndoCommand = {
      kind: 'format',
      before: formatBefore,
      after: formatAfter,
      selectionBefore: selBefore,
      selectionAfter: selAfter,
    }

    it('undo 还原 before 格式与 selectionBefore', () => {
      const { ctx, calls } = makeRecordingContext()
      new FormatUndoHandler(ctx).applyUndo(cmd)
      expect(calls).toEqual([
        { op: 'format', layers: formatBefore },
        { op: 'selection', selection: selBefore },
      ])
    })

    it('redo 还原 after 格式与 selectionAfter', () => {
      const { ctx, calls } = makeRecordingContext()
      new FormatUndoHandler(ctx).applyRedo(cmd)
      expect(calls).toEqual([
        { op: 'format', layers: formatAfter },
        { op: 'selection', selection: selAfter },
      ])
    })
  })

  for (const kind of ['merge', 'unmerge'] as const) {
    describe(kind, () => {
      const cmd: UndoCommand = {
        kind,
        before: mergeBefore,
        after: mergeAfter,
        selectionBefore: selBefore,
        selectionAfter: selAfter,
      }

      it('undo 还原 before 合并与 selectionBefore', () => {
        const { ctx, calls } = makeRecordingContext()
        new FormatUndoHandler(ctx).applyUndo(cmd)
        expect(calls).toEqual([
          { op: 'merge', regions: mergeBefore },
          { op: 'selection', selection: selBefore },
        ])
      })

      it('redo 还原 after 合并与 selectionAfter', () => {
        const { ctx, calls } = makeRecordingContext()
        new FormatUndoHandler(ctx).applyRedo(cmd)
        expect(calls).toEqual([
          { op: 'merge', regions: mergeAfter },
          { op: 'selection', selection: selAfter },
        ])
      })
    })
  }

  describe('format with attachments', () => {
    const attachBefore: CellAttachmentSnapshot = [
      { row: 0, col: 0, namespace: 'demo', data: { note: 'x' } },
    ]
    const attachAfter: CellAttachmentSnapshot = [
      { row: 0, col: 0, namespace: 'demo', data: { note: 'y' } },
    ]
    const cmd: UndoCommand = {
      kind: 'format',
      before: formatBefore,
      after: formatAfter,
      selectionBefore: selBefore,
      selectionAfter: selAfter,
      attachmentBefore: attachBefore,
      attachmentAfter: attachAfter,
    }

    it('undo 还原 before 格式 + attachmentBefore + selectionBefore', () => {
      const { ctx, calls } = makeRecordingContext()
      new FormatUndoHandler(ctx).applyUndo(cmd)
      expect(calls).toEqual([
        { op: 'format', layers: formatBefore },
        { op: 'attachment', snap: attachBefore },
        { op: 'selection', selection: selBefore },
      ])
    })

    it('redo 还原 after 格式 + attachmentAfter + selectionAfter', () => {
      const { ctx, calls } = makeRecordingContext()
      new FormatUndoHandler(ctx).applyRedo(cmd)
      expect(calls).toEqual([
        { op: 'format', layers: formatAfter },
        { op: 'attachment', snap: attachAfter },
        { op: 'selection', selection: selAfter },
      ])
    })

    it('format 命令无附件字段时 undo 不调用 restoreAttachments', () => {
      const cmdNoAttach: UndoCommand = {
        kind: 'format',
        before: formatBefore,
        after: formatAfter,
        selectionBefore: selBefore,
        selectionAfter: selAfter,
      }
      const { ctx, calls } = makeRecordingContext()
      new FormatUndoHandler(ctx).applyUndo(cmdNoAttach)
      expect(calls.every((c) => c.op !== 'attachment')).toBe(true)
    })
  })
})
