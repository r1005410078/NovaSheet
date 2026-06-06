import { describe, expect, it } from 'bun:test'
import { PasteController } from '../../../src/features/clipboard/PasteController'
import type { PasteControllerContext } from '../../../src/features/clipboard/PasteController'
import type { ApplyPasteSource, PasteTargetRect } from '../../../src/features/clipboard/ApplyPaste'
import type { MutableDataSource } from '../../../src/kernel/data/MutableDataSource'
import type { MergeRegion } from '../../../src/features/merge/MergeStore'
import { asRawRange } from '../../../src/kernel/coords/coordinates'

function pasteSource(cells: (string | number | null)[][], fieldIds: string[]): ApplyPasteSource {
  return { cells, sourceFieldIds: fieldIds, typed: false }
}

function targetRect(
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number,
): PasteTargetRect {
  return { startRow, endRow, startCol, endCol, tile: { rows: 1, cols: 1 } }
}

function makeData(overrides: Partial<MutableDataSource> = {}): MutableDataSource {
  return {
    getSchema: () => ({ fields: [{ id: 'a', name: 'A', type: 'text', width: 100 }] }),
    getRowCount: () => 2,
    getCell: () => 'old',
    getRows: () => [],
    updateCell: () => {},
    ...overrides,
  } as MutableDataSource
}

function makeCtx(overrides: Partial<PasteControllerContext> = {}): {
  ctx: PasteControllerContext
  pushed: unknown[]
  skipped: unknown[]
} {
  const pushed: unknown[] = []
  const skipped: unknown[] = []
  const merges: MergeRegion[] = [
    {
      id: 'merge-1',
      range: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
      anchor: { rowIndex: 0, colIndex: 0 },
    },
  ]
  const ctx: PasteControllerContext = {
    getMutableData: () => makeData(),
    viewRangeToRaw: (r) => asRawRange(r),
    getMergeSnapshot: () => merges,
    getSchema: () => ({ fields: [{ id: 'a', name: 'A', type: 'text', width: 100 }] }),
    viewRowToRaw: (r) => r,
    pushUndo: (c) => pushed.push(c),
    ...overrides,
  }
  return { ctx, pushed, skipped }
}

describe('PasteController', () => {
  it('merge 冲突时 onSkipped、无 pushUndo', () => {
    const { ctx, pushed, skipped } = makeCtx()
    const pc = new PasteController(ctx)
    pc.commit(
      pasteSource([['p']], ['a']),
      targetRect(0, 0, 0, 0),
      ['a'],
      (cells) => skipped.push(...cells),
    )
    expect(skipped).toEqual([{ rowIndex: 0, fieldId: 'a', reason: 'merge' }])
    expect(pushed).toHaveLength(0)
  })

  it('成功粘贴 push paste undo', () => {
    const updates: { row: number; fieldId: string; value: unknown }[] = []
    const { ctx, pushed } = makeCtx({
      getMergeSnapshot: () => [],
      getMutableData: () =>
        makeData({
          updateCell: (row, fieldId, value) => updates.push({ row, fieldId, value }),
        }),
    })
    const pc = new PasteController(ctx)
    pc.commit(pasteSource([['new']], ['a']), targetRect(0, 0, 0, 0), ['a'])
    expect(updates).toEqual([{ row: 0, fieldId: 'a', value: 'new' }])
    expect(pushed[0]).toMatchObject({ kind: 'paste' })
  })
})
