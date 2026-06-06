import type { CellRange } from '../selection/SelectionTypes'
import type { BorderPreset, BorderStyle, CellBorders } from './CellFormat'

/**
 * Computes the border patch to apply to a single cell within a range for a given preset.
 * Excludes 'clear' — callers must route that to `RangeStyleStore.clearBorders`.
 */
export function borderPatchForCell(
  range: CellRange,
  rowIndex: number,
  colIndex: number,
  preset: Exclude<BorderPreset, 'clear'>,
  border: BorderStyle,
): CellBorders {
  const isTop = rowIndex === range.startRow
  const isBottom = rowIndex === range.endRow
  const isLeft = colIndex === range.startCol
  const isRight = colIndex === range.endCol

  if (preset === 'all') return { top: border, right: border, bottom: border, left: border }

  if (preset === 'outer') {
    return {
      ...(isTop ? { top: border } : {}),
      ...(isRight ? { right: border } : {}),
      ...(isBottom ? { bottom: border } : {}),
      ...(isLeft ? { left: border } : {}),
    }
  }

  if (preset === 'inner') {
    return {
      ...(!isRight ? { right: border } : {}),
      ...(!isBottom ? { bottom: border } : {}),
    }
  }

  if (preset === 'innerHorizontal') return !isBottom ? { bottom: border } : {}
  if (preset === 'innerVertical') return !isRight ? { right: border } : {}
  if (preset === 'top') return isTop ? { top: border } : {}
  if (preset === 'bottom') return isBottom ? { bottom: border } : {}
  if (preset === 'left') return isLeft ? { left: border } : {}
  return isRight ? { right: border } : {}
}
