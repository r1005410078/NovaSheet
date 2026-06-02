import type { CellRange, RenderFrame } from '@novasheet/core'
import { computeRangeOverlayRects, type OverlayRect } from '@novasheet/web'

const HANDLE_SIZE = 8

/** 选最靠右下的可见 rect 作为填充柄锚点，避免冻结区重复边框生成多个手柄。 */
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
