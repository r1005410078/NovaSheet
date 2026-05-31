import type { CellAddress, CellRange } from '../interaction/SelectionModel'

/**
 * 共享 range 几何工具（平台无关）。
 *
 * 收口此前散落在 MergeStore / RangeStyleStore / FillTarget / runtime 的重复实现，
 * 避免「同义逻辑多份、修一处漏一处」（如 mergeVisualRange 的 union/replace 分裂）。
 * 纯函数、无分配（`isCellInRange` 取原始参数，供 store 热路径逐格调用）。
 */

/** 单元格 `(rowIndex, colIndex)` 是否落在 `range` 内（含边界）。原始版，无对象分配。 */
export function isCellInRange(rowIndex: number, colIndex: number, range: CellRange): boolean {
  return (
    rowIndex >= range.startRow &&
    rowIndex <= range.endRow &&
    colIndex >= range.startCol &&
    colIndex <= range.endCol
  )
}

/** `cell` 是否落在 `range` 内（含边界）。 */
export function cellInRange(cell: CellAddress, range: CellRange): boolean {
  return isCellInRange(cell.rowIndex, cell.colIndex, range)
}

/** 两个 range 是否相交（含边界接触）。 */
export function rangesIntersect(a: CellRange, b: CellRange): boolean {
  return (
    a.startRow <= b.endRow &&
    a.endRow >= b.startRow &&
    a.startCol <= b.endCol &&
    a.endCol >= b.startCol
  )
}

/** 两个 range 的并集外接矩形（归一化）。 */
export function unionRange(a: CellRange, b: CellRange): CellRange {
  return {
    startRow: Math.min(a.startRow, b.startRow),
    endRow: Math.max(a.endRow, b.endRow),
    startCol: Math.min(a.startCol, b.startCol),
    endCol: Math.max(a.endCol, b.endCol),
  }
}

/** 将数值限制在闭区间 `[min, max]` 内。 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** 将任意方向的 range 归一化为 `start <= end`。 */
export function normalizeRange(range: CellRange): CellRange {
  return {
    startRow: Math.min(range.startRow, range.endRow),
    endRow: Math.max(range.startRow, range.endRow),
    startCol: Math.min(range.startCol, range.endCol),
    endCol: Math.max(range.startCol, range.endCol),
  }
}

/** 将 range 的四个端点夹到 bounds 内；输入可为反向 range。 */
export function clampRange(range: CellRange, bounds: CellRange): CellRange {
  const normalized = normalizeRange(range)
  const normalizedBounds = normalizeRange(bounds)
  return {
    startRow: clamp(normalized.startRow, normalizedBounds.startRow, normalizedBounds.endRow),
    endRow: clamp(normalized.endRow, normalizedBounds.startRow, normalizedBounds.endRow),
    startCol: clamp(normalized.startCol, normalizedBounds.startCol, normalizedBounds.endCol),
    endCol: clamp(normalized.endCol, normalizedBounds.startCol, normalizedBounds.endCol),
  }
}
