import { ChunkedAxis } from '../../layout/ChunkedAxis'

/** 行移动归一化后的计划；调用方据此执行 move 与 undo 反向 move。 */
export interface RowMovePlan {
  readonly rowIds: readonly number[]
  readonly beforeRowId: number | null
  readonly inverseRowIds: readonly number[]
  readonly inverseBeforeRowId: number | null
  readonly indexMap: ReadonlyMap<number, number>
}

/** 归一化连续行组移动；非法或无实际顺序变化时返回 null。 */
export function normalizeMoveRows(
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

/** 按 `oldIndex -> newIndex` map 重排数组值。 */
export function reorderByIndexMap<T>(
  values: readonly T[],
  indexMap: ReadonlyMap<number, number>,
): T[] {
  const next = values.slice()
  for (let oldIndex = 0; oldIndex < values.length; oldIndex += 1) {
    const newIndex = indexMap.get(oldIndex)
    if (newIndex !== undefined) next[newIndex] = values[oldIndex]!
  }
  return next
}

/** 捕获 raw row axis 的每一行高度，供移动/重建/undo 前后快照使用。 */
export function captureRowHeights(axis: ChunkedAxis): number[] {
  return Array.from({ length: axis.getCount() }, (_, index) => axis.getSize(index))
}

/** 用高度快照重建 raw row axis，仅保留非默认高度的稀疏覆盖。 */
export function buildRawRowsAxisFromHeights(
  heights: readonly number[],
  defaultHeight: number,
): ChunkedAxis {
  const axis = new ChunkedAxis({ count: heights.length, defaultSize: defaultHeight })
  for (let i = 0; i < heights.length; i += 1) {
    if (heights[i] !== defaultHeight) axis.setSize(i, heights[i]!)
  }
  return axis
}

/** 按 `oldIndex -> newIndex` map 重映行 id；不存在的旧 id 会被过滤。 */
export function remapRowsByIndexMap(
  rowIds: readonly number[],
  indexMap: ReadonlyMap<number, number>,
): number[] {
  return rowIds
    .map((rowId) => indexMap.get(rowId))
    .filter((rowId): rowId is number => rowId !== undefined)
}

/** 归一化删除行请求；空集、越界或非严格升序时返回 null。 */
export function normalizeDeleteRows(
  rowCount: number,
  rowIds: readonly number[],
): readonly number[] | null {
  if (rowIds.length === 0) return null
  for (let i = 0; i < rowIds.length; i += 1) {
    const rowId = rowIds[i]!
    if (rowId < 0 || rowId >= rowCount) return null
    if (i > 0 && rowId <= rowIds[i - 1]!) return null
  }
  return rowIds
}

/** 从 hide 请求里筛出真正会新增隐藏状态的行。 */
export function getNewlyHiddenRows(
  rowIds: readonly number[],
  hiddenRows: ReadonlySet<number>,
): number[] {
  return rowIds.filter((id) => !hiddenRows.has(id))
}

/** 从 unhide 请求里筛出当前确实隐藏的行。 */
export function getNewlyVisibleRows(
  rowIds: readonly number[],
  hiddenRows: ReadonlySet<number>,
): number[] {
  return rowIds.filter((id) => hiddenRows.has(id))
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
