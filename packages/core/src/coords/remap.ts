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

/**
 * 一维区间 `[start, end]`（含两端）的结构变更 remap，供 Phase 5-A 格式/合并区间使用。
 * 与上面的单索引 helper 共用「at 及之后平移、删除后塌缩、索引映射后重规整」语义。
 */
export interface IndexSpan {
  readonly start: number
  readonly end: number
}

/** 插入后平移：任何 `>= at` 的端点 `+count`（跨越插入点的区间随之增长）。 */
export function remapSpanAfterInsert(span: IndexSpan, at: number, count: number): IndexSpan {
  return {
    start: span.start >= at ? span.start + count : span.start,
    end: span.end >= at ? span.end + count : span.end,
  }
}

/**
 * 删除后塌缩：按 `removedSorted` 重建区间。区间内幸存索引保持相对顺序，
 * 塌缩后必然连续，故只需算幸存数量与下移量。区间内全被删除时返回 null。
 */
export function remapSpanAfterDelete(span: IndexSpan, removedSorted: readonly number[]): IndexSpan | null {
  let removedBelowStart = 0
  let removedInSpan = 0
  for (const removed of removedSorted) {
    if (removed < span.start) removedBelowStart += 1
    else if (removed <= span.end) removedInSpan += 1
    else break
  }
  const survivingCount = span.end - span.start + 1 - removedInSpan
  if (survivingCount <= 0) return null
  const start = span.start - removedBelowStart
  return { start, end: start + survivingCount - 1 }
}

/**
 * 索引映射后重规整：用 `oldIndex → newIndex` map 各自映射两端再取 min/max。
 * 调用方保证区间为连续块（move 把整块迁移），故端点映射 + 规整即可。
 * 任一端点无映射时返回 null（不应发生于全排列 map）。
 */
export function remapSpanByIndexMap(span: IndexSpan, indexMap: ReadonlyMap<number, number>): IndexSpan | null {
  const a = indexMap.get(span.start)
  const b = indexMap.get(span.end)
  if (a === undefined || b === undefined) return null
  return { start: Math.min(a, b), end: Math.max(a, b) }
}
