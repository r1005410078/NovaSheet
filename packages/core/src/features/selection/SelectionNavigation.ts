/**
 * Phase 3.3 — 键盘导航：方向键 / Tab / Enter 移动 active cell，Shift 扩展选区。
 */

import type {
  CellAddress,
  CellRange,
  GridSelection,
  SelectCellOptions,
} from '../../kernel/coords/SelectionTypes'

export interface GridIndexBounds {
  readonly rowCount: number
  readonly colCount: number
}

/** 导航查询合并区的窄接口；engine 注入 view 坐标合并查询，纯规则不依赖 mergeStore。 */
export interface SelectionMergeLookup {
  /** 返回包含 (rowIndex,colIndex) 的合并区矩形（view 坐标），无则 null。 */
  resolveMergeRegion(rowIndex: number, colIndex: number): CellRange | null
}

const NO_MERGE: SelectionMergeLookup = { resolveMergeRegion: () => null }

export type SelectionNavigationIntent =
  | {
      readonly kind: 'delta'
      readonly dRow: number
      readonly dCol: number
      readonly extend: boolean
    }
  | { readonly kind: 'tab'; readonly backward: boolean; readonly extend: boolean }

export function parseSelectionNavigationKey(
  key: string,
  shiftKey: boolean,
): SelectionNavigationIntent | null {
  switch (key) {
    case 'ArrowUp':
      return { kind: 'delta', dRow: -1, dCol: 0, extend: shiftKey }
    case 'ArrowDown':
      return { kind: 'delta', dRow: 1, dCol: 0, extend: shiftKey }
    case 'ArrowLeft':
      return { kind: 'delta', dRow: 0, dCol: -1, extend: shiftKey }
    case 'ArrowRight':
      return { kind: 'delta', dRow: 0, dCol: 1, extend: shiftKey }
    case 'Tab':
      // Shift 只决定方向，不扩展选区（对齐 Excel/Sheets：Shift+Tab 反向移动）。
      return { kind: 'tab', backward: shiftKey, extend: false }
    case 'Enter':
      // Shift+Enter 向上移动 active cell，同样不扩展选区。
      return { kind: 'delta', dRow: shiftKey ? -1 : 1, dCol: 0, extend: false }
    default:
      return null
  }
}

export interface SelectionNavigationTarget {
  getSelection(): GridSelection
  selectCell(cell: CellAddress, options?: SelectCellOptions): void
  setSelectedRange(range: CellRange): void
}

export function applySelectionNavigation(
  model: SelectionNavigationTarget,
  intent: SelectionNavigationIntent,
  bounds: GridIndexBounds,
  merge: SelectionMergeLookup = NO_MERGE,
): CellAddress | null {
  if (bounds.rowCount <= 0 || bounds.colCount <= 0) return null

  const origin = resolveNavigationOrigin(model, intent.extend)
  // 从 origin 所在合并区的相应边缘起步，避免方向键卡在合并区内部。
  const originRegion = merge.resolveMergeRegion(origin.rowIndex, origin.colIndex)
  const next =
    intent.kind === 'tab'
      ? stepTab(origin, originRegion, bounds, intent.backward)
      : stepDelta(origin, originRegion, intent.dRow, intent.dCol, bounds)

  const nextRegion = merge.resolveMergeRegion(next.rowIndex, next.colIndex)
  if (intent.extend) {
    // 扩展选区仍按索引推进；merge-aware 的整块扩展留待后续。
    model.selectCell(next, { extend: true })
    return next
  }
  if (nextRegion) {
    model.setSelectedRange(nextRegion)
    return { rowIndex: nextRegion.startRow, colIndex: nextRegion.startCol }
  }
  model.selectCell(next)
  return next
}

function resolveNavigationOrigin(model: SelectionNavigationTarget, extend: boolean): CellAddress {
  const selection = model.getSelection()
  if (extend) {
    return selection.extentCell ?? selection.activeCell ?? { rowIndex: 0, colIndex: 0 }
  }
  return selection.activeCell ?? { rowIndex: 0, colIndex: 0 }
}

function stepDelta(
  origin: CellAddress,
  originRegion: CellRange | null,
  dRow: number,
  dCol: number,
  bounds: GridIndexBounds,
): CellAddress {
  const edge = regionEdge(origin, originRegion, dRow, dCol)
  return {
    rowIndex: clampIndex(edge.rowIndex + dRow, bounds.rowCount),
    colIndex: clampIndex(edge.colIndex + dCol, bounds.colCount),
  }
}

function stepTab(
  origin: CellAddress,
  originRegion: CellRange | null,
  bounds: GridIndexBounds,
  backward: boolean,
): CellAddress {
  // Tab 沿列推进，从合并区左/右边缘起步以整块跨越。
  const edge = regionEdge(origin, originRegion, 0, backward ? -1 : 1)
  if (backward) {
    if (edge.colIndex > 0) {
      return { rowIndex: edge.rowIndex, colIndex: edge.colIndex - 1 }
    }
    if (edge.rowIndex > 0) {
      return { rowIndex: edge.rowIndex - 1, colIndex: bounds.colCount - 1 }
    }
    return origin
  }

  if (edge.colIndex < bounds.colCount - 1) {
    return { rowIndex: edge.rowIndex, colIndex: edge.colIndex + 1 }
  }
  if (edge.rowIndex < bounds.rowCount - 1) {
    return { rowIndex: edge.rowIndex + 1, colIndex: 0 }
  }
  return origin
}

/** 取 origin 所在合并区在行进方向上的边缘单元格；无合并区时返回 origin。 */
function regionEdge(
  origin: CellAddress,
  region: CellRange | null,
  dRow: number,
  dCol: number,
): CellAddress {
  if (!region) return origin
  return {
    rowIndex: dRow > 0 ? region.endRow : dRow < 0 ? region.startRow : origin.rowIndex,
    colIndex: dCol > 0 ? region.endCol : dCol < 0 ? region.startCol : origin.colIndex,
  }
}

function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0
  return Math.max(0, Math.min(count - 1, index))
}
