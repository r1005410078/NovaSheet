import type { CellAddress } from '../coords/SelectionTypes'
import type { RenderFrame } from '../render/RenderFrame'
import { hitTestCellWithRegion, type HitTestPoint } from './HitTest'
import type { ResolvedSelectionBehavior } from './SelectionBehavior'

/** pointer 起点解析出的唯一选择意图。 */
export type SelectionIntent =
  | { readonly kind: 'cell'; readonly cell: CellAddress }
  | { readonly kind: 'row'; readonly rowIndex: number }
  | { readonly kind: 'column'; readonly colIndex: number }
  | { readonly kind: 'all' }
  | { readonly kind: 'none' }

/**
 * 仅对 header corner 和数据 region 求值；表头带、空白区返回 null，交回既有链路。
 */
export function resolveSelectionIntent(
  frame: RenderFrame,
  point: HitTestPoint,
  behavior: ResolvedSelectionBehavior,
): SelectionIntent | null {
  const headerHeight = frame.viewport.headerHeight
  const rowHeaderWidth = frame.viewport.rowHeaderWidth
  if (
    rowHeaderWidth > 0 &&
    headerHeight > 0 &&
    point.x >= 0 &&
    point.x < rowHeaderWidth &&
    point.y >= 0 &&
    point.y < headerHeight
  ) {
    return behavior.headerCorner === 'all' ? { kind: 'all' } : { kind: 'none' }
  }

  const hit = hitTestCellWithRegion(frame, point)
  if (hit === null) return null

  const intent = behavior.regionIntents[hit.region.id]
  if (intent === 'row') return { kind: 'row', rowIndex: hit.cell.rowIndex }
  if (intent === 'column') return { kind: 'column', colIndex: hit.cell.colIndex }
  return { kind: 'cell', cell: hit.cell }
}
