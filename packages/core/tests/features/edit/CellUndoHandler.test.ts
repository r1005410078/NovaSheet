import { describe, expect, it } from 'bun:test'

import { CellUndoHandler } from '../../../src/features/edit/CellUndoHandler'
import type { CellUndoContext } from '../../../src/kernel/undo/UndoHandler'
import type { CellValue } from '../../../src/kernel/data/Schema'
import type { CellRange } from '../../../src/kernel/coords/SelectionTypes'
import type { CellWrite, UndoCommand } from '../../../src/kernel/undo/UndoCommand'

import type { CellAttachmentSnapshot } from '../../../src/kernel/protocol/AttachmentTypes'

type WriteCall = { op: 'write'; rowIndex: number; fieldId: string; value: CellValue }
type EditSelCall = { op: 'restoreEdit'; rowIndex: number; fieldId: string }
type WritesSelCall = { op: 'restoreWrites'; writes: ReadonlyArray<CellWrite>; fallbackRange: CellRange }
type RestoreAttachmentsCall = { op: 'restoreAttachments'; snap: CellAttachmentSnapshot }
type Call = WriteCall | EditSelCall | WritesSelCall | RestoreAttachmentsCall

function makeRecordingContext(withRestoreAttachments = false): { ctx: CellUndoContext; calls: Call[] } {
  const calls: Call[] = []
  const ctx: CellUndoContext = {
    applyCellWrite(rowIndex, fieldId, value) {
      calls.push({ op: 'write', rowIndex, fieldId, value })
    },
    restoreSelectionAfterEdit(rowIndex, fieldId) {
      calls.push({ op: 'restoreEdit', rowIndex, fieldId })
    },
    restoreSelectionForWrites(writes, fallbackRange) {
      calls.push({ op: 'restoreWrites', writes, fallbackRange })
    },
    ...(withRestoreAttachments
      ? {
          restoreAttachments(snap: CellAttachmentSnapshot) {
            calls.push({ op: 'restoreAttachments', snap })
          },
        }
      : {}),
  }
  return { ctx, calls }
}

const RANGE: CellRange = { startRow: 0, endRow: 1, startCol: 0, endCol: 1 }
const TARGET: CellRange = { startRow: 2, endRow: 3, startCol: 2, endCol: 3 }

describe('CellUndoHandler', () => {
  it('domain 为 cell，仅 handles editCell/clearRange/paste', () => {
    const { ctx } = makeRecordingContext()
    const handler = new CellUndoHandler(ctx)
    expect(handler.domain).toBe('cell')
    expect(handler.handles('editCell')).toBe(true)
    expect(handler.handles('clearRange')).toBe(true)
    expect(handler.handles('paste')).toBe(true)
    expect(handler.handles('fill')).toBe(false)
    expect(handler.handles('format')).toBe(false)
    expect(handler.handles('merge')).toBe(false)
    expect(handler.handles('resizeRow')).toBe(false)
  })

  describe('editCell', () => {
    const cmd: UndoCommand = {
      kind: 'editCell',
      rowIndex: 5,
      fieldId: 'a',
      before: 'old',
      after: 'new',
    }

    it('undo 写 before 并恢复编辑选区', () => {
      const { ctx, calls } = makeRecordingContext()
      new CellUndoHandler(ctx).applyUndo(cmd)
      expect(calls).toEqual([
        { op: 'write', rowIndex: 5, fieldId: 'a', value: 'old' },
        { op: 'restoreEdit', rowIndex: 5, fieldId: 'a' },
      ])
    })

    it('redo 写 after 并恢复编辑选区', () => {
      const { ctx, calls } = makeRecordingContext()
      new CellUndoHandler(ctx).applyRedo(cmd)
      expect(calls).toEqual([
        { op: 'write', rowIndex: 5, fieldId: 'a', value: 'new' },
        { op: 'restoreEdit', rowIndex: 5, fieldId: 'a' },
      ])
    })
  })

  describe('clearRange', () => {
    const before: ReadonlyArray<CellWrite> = [
      { rowIndex: 0, fieldId: 'a', value: 'x' },
      { rowIndex: 1, fieldId: 'b', value: 'y' },
    ]
    const cmd: UndoCommand = { kind: 'clearRange', range: RANGE, before }

    it('undo 逐格写回 before，按 range 恢复选区', () => {
      const { ctx, calls } = makeRecordingContext()
      new CellUndoHandler(ctx).applyUndo(cmd)
      expect(calls).toEqual([
        { op: 'write', rowIndex: 0, fieldId: 'a', value: 'x' },
        { op: 'write', rowIndex: 1, fieldId: 'b', value: 'y' },
        { op: 'restoreWrites', writes: before, fallbackRange: RANGE },
      ])
    })

    it('redo 逐格写 null（非 value），仍用 before/range 恢复选区', () => {
      const { ctx, calls } = makeRecordingContext()
      new CellUndoHandler(ctx).applyRedo(cmd)
      expect(calls).toEqual([
        { op: 'write', rowIndex: 0, fieldId: 'a', value: null },
        { op: 'write', rowIndex: 1, fieldId: 'b', value: null },
        { op: 'restoreWrites', writes: before, fallbackRange: RANGE },
      ])
    })

    describe('携带 attachment 快照', () => {
      const attachmentBefore: CellAttachmentSnapshot = [
        { row: 0, col: 0, namespace: 'demo', data: { v: 1 } },
      ]
      const attachmentAfter: CellAttachmentSnapshot = []
      const cmdWithAttachment: UndoCommand = {
        kind: 'clearRange',
        range: RANGE,
        before,
        attachmentBefore,
        attachmentAfter,
      }

      it('undo 恢复 attachmentBefore', () => {
        const { ctx, calls } = makeRecordingContext(true)
        new CellUndoHandler(ctx).applyUndo(cmdWithAttachment)
        expect(calls).toContainEqual({ op: 'restoreAttachments', snap: attachmentBefore })
      })

      it('redo 恢复 attachmentAfter', () => {
        const { ctx, calls } = makeRecordingContext(true)
        new CellUndoHandler(ctx).applyRedo(cmdWithAttachment)
        expect(calls).toContainEqual({ op: 'restoreAttachments', snap: attachmentAfter })
      })

      it('无 attachmentBefore 时 undo 不调 restoreAttachments', () => {
        const { ctx, calls } = makeRecordingContext(true)
        new CellUndoHandler(ctx).applyUndo(cmd)
        expect(calls.some((c) => c.op === 'restoreAttachments')).toBe(false)
      })
    })
  })

  describe('paste', () => {
    const before: ReadonlyArray<CellWrite> = [
      { rowIndex: 2, fieldId: 'c', value: 'old1' },
      { rowIndex: 3, fieldId: 'd', value: 'old2' },
    ]
    const after: ReadonlyArray<CellWrite> = [
      { rowIndex: 2, fieldId: 'c', value: 'new1' },
      { rowIndex: 3, fieldId: 'd', value: 'new2' },
    ]
    const cmd: UndoCommand = { kind: 'paste', target: TARGET, before, after }

    it('undo 逐格写 before，按 target 恢复选区', () => {
      const { ctx, calls } = makeRecordingContext()
      new CellUndoHandler(ctx).applyUndo(cmd)
      expect(calls).toEqual([
        { op: 'write', rowIndex: 2, fieldId: 'c', value: 'old1' },
        { op: 'write', rowIndex: 3, fieldId: 'd', value: 'old2' },
        { op: 'restoreWrites', writes: before, fallbackRange: TARGET },
      ])
    })

    it('redo 逐格写 after，按 target 恢复选区（用 after 而非 before）', () => {
      const { ctx, calls } = makeRecordingContext()
      new CellUndoHandler(ctx).applyRedo(cmd)
      expect(calls).toEqual([
        { op: 'write', rowIndex: 2, fieldId: 'c', value: 'new1' },
        { op: 'write', rowIndex: 3, fieldId: 'd', value: 'new2' },
        { op: 'restoreWrites', writes: after, fallbackRange: TARGET },
      ])
    })
  })
})
