/**
 * 行号 remap：行结构变更后，把 underlying rowIndex 平移到新位置。
 * Selection / FillRange / Clipboard 共享同一组函数，保证行为统一。
 * Phase 4.5 实现，对应 spec §7.3。
 */

export function remapRowIndexAfterInsert(
  rowIndex: number,
  at: number,
  count: number,
): number {
  if (rowIndex < at) return rowIndex
  return rowIndex + count
}

export function remapRowIndexAfterDelete(
  rowIndex: number,
  removedSorted: readonly number[],
): number | null {
  let shift = 0
  for (const removed of removedSorted) {
    if (removed === rowIndex) return null
    if (removed < rowIndex) shift += 1
    else break
  }
  return rowIndex - shift
}

/** 列号 remap：列结构变更后，把 view/schema colIndex 平移到新位置。 */
export function remapColIndexAfterInsert(
  colIndex: number,
  at: number,
  count: number,
): number {
  if (colIndex < at) return colIndex
  return colIndex + count
}

export function remapColIndexAfterDelete(
  colIndex: number,
  removedSorted: readonly number[],
): number | null {
  let shift = 0
  for (const removed of removedSorted) {
    if (removed === colIndex) return null
    if (removed < colIndex) shift += 1
    else break
  }
  return colIndex - shift
}
