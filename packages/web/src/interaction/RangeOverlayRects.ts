import type { CellRange, RenderFrame } from '@novasheet/core'

/** DOM overlay 使用的 CSS 像素矩形，坐标相对 grid container。 */
export interface OverlayRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

const HANDLE_SIZE = 8

/** 把一个逻辑 CellRange 拆成当前 frame 可见区域内的 DOM overlay 矩形；冻结区会产生多个 rect。 */
export function computeRangeOverlayRects(frame: RenderFrame, range: CellRange): OverlayRect[] {
  const rects: OverlayRect[] = []
  for (const region of frame.viewport.regions) {
    const startRow = Math.max(range.startRow, region.rowRange[0])
    const endRow = Math.min(range.endRow, region.rowRange[1])
    const startCol = Math.max(range.startCol, region.colRange[0])
    const endCol = Math.min(range.endCol, region.colRange[1])
    if (endRow < startRow || endCol < startCol) continue

    const x = region.rect.x + frame.colsAxis.indexToPosition(startCol) - region.scrollOffsetX
    const y = region.rect.y + frame.rowsAxis.indexToPosition(startRow) - region.scrollOffsetY
    const right =
      region.rect.x +
      frame.colsAxis.indexToPosition(endCol) -
      region.scrollOffsetX +
      frame.colsAxis.getSize(endCol)
    const bottom =
      region.rect.y +
      frame.rowsAxis.indexToPosition(endRow) -
      region.scrollOffsetY +
      frame.rowsAxis.getSize(endRow)
    const clippedX = Math.max(x, region.rect.x)
    const clippedY = Math.max(y, region.rect.y)
    const clippedRight = Math.min(right, region.rect.x + region.rect.width)
    const clippedBottom = Math.min(bottom, region.rect.y + region.rect.height)
    if (clippedRight <= clippedX || clippedBottom <= clippedY) continue
    rects.push({
      x: clippedX,
      y: clippedY,
      width: clippedRight - clippedX,
      height: clippedBottom - clippedY,
    })
  }
  return rects
}

/** 选择最靠右下的可见 rect 作为填充柄锚点，避免冻结区重复边框生成多个手柄。 */
export function computeFillHandleRect(frame: RenderFrame, range: CellRange): OverlayRect | null {
  const rects = computeRangeOverlayRects(frame, range)
  if (rects.length === 0) return null
  const bottomRight = rects
    .slice()
    .sort((a, b) => a.y + a.height - (b.y + b.height) || a.x + a.width - (b.x + b.width))
    .at(-1)!
  return {
    x: bottomRight.x + bottomRight.width - HANDLE_SIZE / 2,
    y: bottomRight.y + bottomRight.height - HANDLE_SIZE / 2,
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
  }
}
