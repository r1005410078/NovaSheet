import { describe, expect, it } from 'bun:test'
import { StructuralMutationCoordinator } from '../../src/engine/StructuralMutationCoordinator'
import type { StructuralMutationContext } from '../../src/engine/StructuralMutationCoordinator'
import type { GridSelection } from '../../src/kernel/coords/SelectionTypes'

const EMPTY: GridSelection = {
  activeCell: null,
  anchorCell: null,
  extentCell: null,
  selectedRange: null,
}

function makeCtx(overrides: Partial<StructuralMutationContext> = {}): {
  ctx: StructuralMutationContext
  pushed: unknown[]
  rebuilt: string[]
} {
  const pushed: unknown[] = []
  const rebuilt: string[] = []
  const ctx: StructuralMutationContext = {
    getSelection: () => EMPTY,
    pushUndo: (c) => pushed.push(c),
    rebuildRows: () => rebuilt.push('rows'),
    rebuildCols: () => rebuilt.push('cols'),
    snapshotFormatMerge: () => ({ formatBefore: [], mergeBefore: [] }),
    snapshotFormatMergeAfter: () => ({ formatAfter: [], mergeAfter: [] }),
    getFrozenConfig: () => ({ topRows: 0, leftCols: 0, rightCols: 0 }),
    ...overrides,
  }
  return { ctx, pushed, rebuilt }
}

describe('StructuralMutationCoordinator', () => {
  it('execute 返回 null 时不 rebuild、不入栈', () => {
    const { ctx, pushed, rebuilt } = makeCtx()
    const coord = new StructuralMutationCoordinator(ctx)
    const result = coord.runCommandStructural({
      execute: () => null,
      rebuild: 'rows',
      buildUndo: () => ({
        kind: 'hideRows',
        underlyingRowIds: [],
        selectionBefore: EMPTY,
        selectionAfter: EMPTY,
      }),
    })
    expect(result).toBeNull()
    expect(rebuilt).toEqual([])
    expect(pushed).toHaveLength(0)
  })

  it('withFormatMerge 时 before/after 快照传入 buildUndo', () => {
    const { ctx, pushed } = makeCtx({
      snapshotFormatMerge: () => ({ formatBefore: [{ order: 0 } as never], mergeBefore: [] }),
      snapshotFormatMergeAfter: () => ({ formatAfter: [{ order: 1 } as never], mergeAfter: [] }),
    })
    const coord = new StructuralMutationCoordinator(ctx)
    coord.runCommandStructural({
      execute: () => ({ at: 1, count: 1, newRowIds: [1] }),
      rebuild: 'rows',
      withFormatMerge: true,
      buildUndo: (_e, sel, ex) => ({
        kind: 'insertRows',
        at: 1,
        count: 1,
        newIds: [1],
        selectionBefore: sel.selectionBefore,
        selectionAfter: sel.selectionAfter,
        formatBefore: ex!.formatBefore!,
        formatAfter: ex!.formatAfter!,
        mergeBefore: ex!.mergeBefore!,
        mergeAfter: ex!.mergeAfter!,
      }),
    })
    expect(pushed).toHaveLength(1)
    expect((pushed[0] as { formatBefore: unknown[] }).formatBefore).toHaveLength(1)
    expect((pushed[0] as { formatAfter: unknown[] }).formatAfter).toHaveLength(1)
  })

  it('afterExecute 在 rebuild 之前调用', () => {
    const order: string[] = []
    const { ctx } = makeCtx({
      rebuildRows: () => order.push('rebuild'),
    })
    const coord = new StructuralMutationCoordinator(ctx)
    coord.runCommandStructural({
      execute: () => ({ ok: true }),
      rebuild: 'rows',
      afterExecute: () => order.push('afterExecute'),
      buildUndo: () => ({
        kind: 'hideRows',
        underlyingRowIds: [],
        selectionBefore: EMPTY,
        selectionAfter: EMPTY,
      }),
    })
    expect(order).toEqual(['afterExecute', 'rebuild'])
  })
})
