import type { CellAddress, CellRange } from '../selection/SelectionTypes'
import { clamp, unionRange } from '../../kernel/geometry/range'

/** 填充柄拖拽的主方向；一次拖拽只沿一个轴扩展。 */
export type FillDirection = 'down' | 'up' | 'right' | 'left'

/** 由 source 选区和 hover cell 推导出的实际写入范围。 */
export interface FillTarget {
  readonly source: CellRange
  readonly fill: CellRange
  readonly result: CellRange
  readonly direction: FillDirection
}

/** 目标表格边界，用于把越界 hover 坐标 clamp 回合法行列。 */
export interface FillDimensions {
  readonly rowCount: number
  readonly colCount: number
}

/**
 * 合并块吸附尺寸：沿填充轴把 fill 区取整到块倍数，避免拖出半块导致末块无法合并。
 * `rowSpan`/`colSpan` 为源合并块在对应轴上的格数；为 1 时该轴不吸附（普通值填充）。
 */
export interface FillMergeSnap {
  readonly rowSpan: number
  readonly colSpan: number
}

/** 计算填充柄拖拽目标；hover 在 source 内或 clamp 后没有新增格子时返回 null。 */
export function computeFillTarget(
  source: CellRange,
  hover: CellAddress,
  dims: FillDimensions,
  snap?: FillMergeSnap,
  targetMerge?: CellRange,
): FillTarget | null {
  if (dims.rowCount <= 0 || dims.colCount <= 0) return null

  const rowIndex = clamp(hover.rowIndex, 0, dims.rowCount - 1)
  const colIndex = clamp(hover.colIndex, 0, dims.colCount - 1)
  if (
    rowIndex >= source.startRow &&
    rowIndex <= source.endRow &&
    colIndex >= source.startCol &&
    colIndex <= source.endCol
  ) {
    return null
  }

  const above = Math.max(0, source.startRow - rowIndex)
  const below = Math.max(0, rowIndex - source.endRow)
  const left = Math.max(0, source.startCol - colIndex)
  const right = Math.max(0, colIndex - source.endCol)
  const vertical = Math.max(above, below)
  const horizontal = Math.max(left, right)

  let direction: FillDirection
  if (vertical >= horizontal && vertical > 0) direction = below > 0 ? 'down' : 'up'
  else if (horizontal > 0) direction = right > 0 ? 'right' : 'left'
  else return null

  const rawFill = fillRangeForDirection(source, direction, rowIndex, colIndex)
  if (!rawFill) return null
  const fill = snap ? snapFillToBlocks(source, rawFill, direction, snap, dims, targetMerge) : rawFill
  return { source, fill, result: unionRange(source, fill), direction }
}

/**
 * 沿填充方向把 `fill` 区扩到块边界，使末块不被截断：
 * - 光标落在已有合并 `targetMerge` 上时，吸附到该合并的远端边界（不再 round-up 越过它）；
 * - 否则把 fill 取整到源合并块的整倍数（向远离 source 方向），使末块补齐为整块。
 * 取整后越过网格边界则 clamp（边界处可能仍是半块，由 tileFillMerge 跳过该块的合并）。
 */
function snapFillToBlocks(
  source: CellRange,
  fill: CellRange,
  direction: FillDirection,
  snap: FillMergeSnap,
  dims: FillDimensions,
  targetMerge?: CellRange,
): CellRange {
  const roundUp = (count: number, span: number): number => Math.ceil(count / span) * span
  switch (direction) {
    case 'down': {
      const snapped =
        targetMerge !== undefined
          ? targetMerge.endRow
          : source.endRow + roundUp(fill.endRow - source.endRow, snap.rowSpan)
      return { ...fill, endRow: clamp(snapped, fill.endRow, dims.rowCount - 1) }
    }
    case 'up': {
      const snapped =
        targetMerge !== undefined
          ? targetMerge.startRow
          : source.startRow - roundUp(source.startRow - fill.startRow, snap.rowSpan)
      return { ...fill, startRow: clamp(snapped, 0, fill.startRow) }
    }
    case 'right': {
      const snapped =
        targetMerge !== undefined
          ? targetMerge.endCol
          : source.endCol + roundUp(fill.endCol - source.endCol, snap.colSpan)
      return { ...fill, endCol: clamp(snapped, fill.endCol, dims.colCount - 1) }
    }
    case 'left': {
      const snapped =
        targetMerge !== undefined
          ? targetMerge.startCol
          : source.startCol - roundUp(source.startCol - fill.startCol, snap.colSpan)
      return { ...fill, startCol: clamp(snapped, 0, fill.startCol) }
    }
  }
}

function fillRangeForDirection(
  source: CellRange,
  direction: FillDirection,
  rowIndex: number,
  colIndex: number,
): CellRange | null {
  if (direction === 'down' && rowIndex > source.endRow) {
    return {
      startRow: source.endRow + 1,
      endRow: rowIndex,
      startCol: source.startCol,
      endCol: source.endCol,
    }
  }
  if (direction === 'up' && rowIndex < source.startRow) {
    return {
      startRow: rowIndex,
      endRow: source.startRow - 1,
      startCol: source.startCol,
      endCol: source.endCol,
    }
  }
  if (direction === 'right' && colIndex > source.endCol) {
    return {
      startRow: source.startRow,
      endRow: source.endRow,
      startCol: source.endCol + 1,
      endCol: colIndex,
    }
  }
  if (direction === 'left' && colIndex < source.startCol) {
    return {
      startRow: source.startRow,
      endRow: source.endRow,
      startCol: colIndex,
      endCol: source.startCol - 1,
    }
  }
  return null
}
