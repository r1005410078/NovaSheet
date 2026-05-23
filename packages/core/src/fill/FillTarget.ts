import type { CellAddress, CellRange } from '../interaction/SelectionModel'

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

/** 计算填充柄拖拽目标；hover 在 source 内或 clamp 后没有新增格子时返回 null。 */
export function computeFillTarget(
  source: CellRange,
  hover: CellAddress,
  dims: FillDimensions,
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

  const fill = fillRangeForDirection(source, direction, rowIndex, colIndex)
  if (!fill) return null
  return { source, fill, result: unionRange(source, fill), direction }
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

/** 返回两个 range 的归一化联合矩形，供 fill commit 后更新 selection。 */
export function unionRange(a: CellRange, b: CellRange): CellRange {
  return {
    startRow: Math.min(a.startRow, b.startRow),
    endRow: Math.max(a.endRow, b.endRow),
    startCol: Math.min(a.startCol, b.startCol),
    endCol: Math.max(a.endCol, b.endCol),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
