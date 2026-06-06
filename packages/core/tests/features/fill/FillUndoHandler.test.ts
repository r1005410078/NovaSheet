import { describe, expect, it } from 'bun:test'

import { FillUndoHandler } from '../../../src/features/fill/FillUndoHandler'
import type { FillUndoContext } from '../../../src/features/fill/FillUndoHandler'
import type { CellValue } from '../../../src/kernel/data/Schema'
import type { CellRange } from '../../../src/features/selection/SelectionTypes'
import type { FormatLayer } from '../../../src/format/CellFormat'
import type { MergeRegion } from '../../../src/merge/MergeStore'
import type { CellWrite, UndoCommand } from '../../../src/kernel/undo/UndoCommand'

type Call =
  | { op: 'write'; rowIndex: number; fieldId: string; value: CellValue }
  | { op: 'format'; layers: readonly FormatLayer[] }
  | { op: 'merge'; regions: readonly MergeRegion[] }
  | { op: 'selWrites'; writes: readonly CellWrite[]; fallbackRange: CellRange }

function makeRecordingContext(): { ctx: FillUndoContext; calls: Call[] } {
  const calls: Call[] = []
  const ctx: FillUndoContext = {
    applyCellWrite: (rowIndex, fieldId, value) => calls.push({ op: 'write', rowIndex, fieldId, value }),
    restoreFormat: (layers) => calls.push({ op: 'format', layers }),
    restoreMerge: (regions) => calls.push({ op: 'merge', regions }),
    restoreSelectionForWrites: (writes, fallbackRange) => calls.push({ op: 'selWrites', writes, fallbackRange }),
  }
  return { ctx, calls }
}

const source: CellRange = { startRow: 0, endRow: 0, startCol: 0, endCol: 0 }
const result: CellRange = { startRow: 0, endRow: 1, startCol: 0, endCol: 0 }
const before: readonly CellWrite[] = [{ rowIndex: 1, fieldId: 'a', value: null }]
const after: readonly CellWrite[] = [{ rowIndex: 1, fieldId: 'a', value: 'x' }]
const fmtBefore: readonly FormatLayer[] = [
  { range: { startRow: 1, endRow: 1, startCol: 0, endCol: 0 }, patch: {}, order: 0 },
]
const fmtAfter: readonly FormatLayer[] = [
  { range: { startRow: 1, endRow: 1, startCol: 0, endCol: 0 }, patch: { fillColor: '#fff' }, order: 1 },
]
const mrgBefore: readonly MergeRegion[] = []
const mrgAfter: readonly MergeRegion[] = [
  { id: 'm', range: { startRow: 0, endRow: 1, startCol: 0, endCol: 0 }, anchor: { rowIndex: 0, colIndex: 0 } },
]

describe('FillUndoHandler', () => {
  it('domain 为 fill，仅 handles fill', () => {
    const { ctx } = makeRecordingContext()
    const handler = new FillUndoHandler(ctx)
    expect(handler.domain).toBe('fill')
    expect(handler.handles('fill')).toBe(true)
    expect(handler.handles('editCell')).toBe(false)
    expect(handler.handles('moveRows')).toBe(false)
    expect(handler.handles('format')).toBe(false)
  })

  describe('携带 format/merge（连续映射）', () => {
    const cmd: UndoCommand = {
      kind: 'fill',
      source,
      fill: result,
      result,
      before,
      after,
      formatBefore: fmtBefore,
      formatAfter: fmtAfter,
      mergeBefore: mrgBefore,
      mergeAfter: mrgAfter,
    }

    it('undo：写 before → restoreFormat(before) → restoreMerge(before) → 选区(before, source)', () => {
      const { ctx, calls } = makeRecordingContext()
      new FillUndoHandler(ctx).applyUndo(cmd)
      expect(calls).toEqual([
        { op: 'write', rowIndex: 1, fieldId: 'a', value: null },
        { op: 'format', layers: fmtBefore },
        { op: 'merge', regions: mrgBefore },
        { op: 'selWrites', writes: before, fallbackRange: source },
      ])
    })

    it('redo：写 after → restoreFormat(after) → restoreMerge(after) → 选区(after, result)', () => {
      const { ctx, calls } = makeRecordingContext()
      new FillUndoHandler(ctx).applyRedo(cmd)
      expect(calls).toEqual([
        { op: 'write', rowIndex: 1, fieldId: 'a', value: 'x' },
        { op: 'format', layers: fmtAfter },
        { op: 'merge', regions: mrgAfter },
        { op: 'selWrites', writes: after, fallbackRange: result },
      ])
    })
  })

  describe('不携带 format/merge（散裂映射，仅填值）', () => {
    const cmd: UndoCommand = { kind: 'fill', source, fill: result, result, before, after }

    it('undo：仅写 before + 恢复选区，不调 format/merge', () => {
      const { ctx, calls } = makeRecordingContext()
      new FillUndoHandler(ctx).applyUndo(cmd)
      expect(calls).toEqual([
        { op: 'write', rowIndex: 1, fieldId: 'a', value: null },
        { op: 'selWrites', writes: before, fallbackRange: source },
      ])
    })

    it('redo：仅写 after + 恢复选区，不调 format/merge', () => {
      const { ctx, calls } = makeRecordingContext()
      new FillUndoHandler(ctx).applyRedo(cmd)
      expect(calls).toEqual([
        { op: 'write', rowIndex: 1, fieldId: 'a', value: 'x' },
        { op: 'selWrites', writes: after, fallbackRange: result },
      ])
    })
  })
})
