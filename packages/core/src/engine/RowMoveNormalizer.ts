/** Normalized description of a valid row move in raw row-index space. */
export interface RowMovePlan {
  /** Raw row indices that should move, sorted in ascending order. */
  readonly rowIds: readonly number[]
  /** Raw row index before which the moving block should be inserted, or `null` for append. */
  readonly beforeRowId: number | null
  /** Row indices in the post-move order that restore the original block when moved again. */
  readonly inverseRowIds: readonly number[]
  /** Post-move row index before which `inverseRowIds` should be inserted to undo the move. */
  readonly inverseBeforeRowId: number | null
  /** Mapping from old raw row index to new raw row index after the move. */
  readonly indexMap: ReadonlyMap<number, number>
}

/**
 * Validates and normalizes row move requests without mutating data or axes.
 *
 * Row moves are currently limited to one contiguous raw block; this helper keeps that constraint
 * explicit and returns the index remap needed by format/merge stores and row-height snapshots.
 */
export class RowMoveNormalizer {
  normalize(
    rowCount: number,
    rowIds: readonly number[],
    beforeRowId: number | null,
  ): RowMovePlan | null {
    if (rowIds.length === 0) return null
    const moving = [...rowIds].sort((a, b) => a - b)
    if (!areContiguousRows(moving)) return null
    const start = moving[0]!
    const end = moving[moving.length - 1]!
    if (start < 0 || end >= rowCount) return null
    if (beforeRowId !== null && (beforeRowId < 0 || beforeRowId > rowCount)) return null
    if (beforeRowId !== null && beforeRowId >= start && beforeRowId <= end + 1) return null

    const nextOrder = moveIndexBlock(rowCount, start, end, beforeRowId)
    const currentOrder = Array.from({ length: rowCount }, (_, index) => index)
    if (sameNumberOrder(currentOrder, nextOrder)) return null

    const indexMap = new Map<number, number>()
    for (let nextIndex = 0; nextIndex < nextOrder.length; nextIndex += 1) {
      indexMap.set(nextOrder[nextIndex]!, nextIndex)
    }
    const inverseRowIds = moving.map((id) => indexMap.get(id)!).sort((a, b) => a - b)
    const inverseSourceRow = end + 1 < rowCount ? end + 1 : null
    const inverseBeforeRowId = inverseSourceRow === null ? null : indexMap.get(inverseSourceRow)!
    return { rowIds: moving, beforeRowId, inverseRowIds, inverseBeforeRowId, indexMap }
  }
}

function areContiguousRows(rows: readonly number[]): boolean {
  const uniqueRows = new Set(rows)
  if (uniqueRows.size !== rows.length) return false
  const minRow = Math.min(...rows)
  const maxRow = Math.max(...rows)
  return maxRow - minRow + 1 === rows.length
}

function sameNumberOrder(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function moveIndexBlock(
  count: number,
  start: number,
  end: number,
  beforeRowId: number | null,
): number[] {
  const current = Array.from({ length: count }, (_, index) => index)
  const moving = current.slice(start, end + 1)
  const remaining = current.filter((index) => index < start || index > end)
  const insertAt =
    beforeRowId === null
      ? remaining.length
      : beforeRowId > end
        ? beforeRowId - moving.length
        : beforeRowId
  const next = remaining.slice()
  next.splice(insertAt, 0, ...moving)
  return next
}
