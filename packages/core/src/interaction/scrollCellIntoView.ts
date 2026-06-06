/**
 * Phase 3.3 — 计算将单元格滚入视口所需的最小逻辑滚动偏移。
 */

import type { Axis } from '../kernel/geometry/ChunkedAxis'

export interface ScrollRevealInput {
  readonly rowIndex: number
  readonly colIndex: number
  readonly rowsAxis: Axis
  readonly colsAxis: Axis
  readonly scrollX: number
  readonly scrollY: number
  readonly viewportWidth: number
  readonly viewportHeight: number
  readonly headerHeight: number
  readonly rowHeaderWidth: number
}

export interface ScrollRevealResult {
  readonly logicalX: number
  readonly logicalY: number
}

export function computeScrollReveal(input: ScrollRevealInput): ScrollRevealResult | null {
  const {
    rowIndex,
    colIndex,
    rowsAxis,
    colsAxis,
    scrollX,
    scrollY,
    viewportWidth,
    viewportHeight,
    headerHeight,
    rowHeaderWidth,
  } = input

  const visibleH = Math.max(0, viewportHeight - headerHeight)
  const visibleW = Math.max(0, viewportWidth - rowHeaderWidth)

  const cellTop = rowsAxis.indexToPosition(rowIndex)
  const cellBottom = cellTop + rowsAxis.getSize(rowIndex)
  const cellLeft = colsAxis.indexToPosition(colIndex)
  const cellRight = cellLeft + colsAxis.getSize(colIndex)

  let nextY = scrollY
  let nextX = scrollX

  if (cellTop < scrollY) nextY = cellTop
  else if (cellBottom > scrollY + visibleH) nextY = Math.max(0, cellBottom - visibleH)

  if (cellLeft < scrollX) nextX = cellLeft
  else if (cellRight > scrollX + visibleW) nextX = Math.max(0, cellRight - visibleW)

  if (nextX === scrollX && nextY === scrollY) return null
  return { logicalX: nextX, logicalY: nextY }
}
