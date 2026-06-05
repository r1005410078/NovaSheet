/**
 * Phase 3.3 — 键盘导航：方向键 / Tab / Enter 移动 active cell，Shift 扩展选区。
 */

import type {
  CellAddress,
  GridSelection,
  SelectCellOptions,
} from '../engine/selection/SelectionTypes'

export interface GridIndexBounds {
  readonly rowCount: number
  readonly colCount: number
}

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
      return { kind: 'tab', backward: shiftKey, extend: shiftKey }
    case 'Enter':
      return { kind: 'delta', dRow: shiftKey ? -1 : 1, dCol: 0, extend: shiftKey }
    default:
      return null
  }
}

export interface SelectionNavigationTarget {
  getSelection(): GridSelection
  selectCell(cell: CellAddress, options?: SelectCellOptions): void
}

export function applySelectionNavigation(
  model: SelectionNavigationTarget,
  intent: SelectionNavigationIntent,
  bounds: GridIndexBounds,
): CellAddress | null {
  if (bounds.rowCount <= 0 || bounds.colCount <= 0) return null

  const origin = resolveNavigationOrigin(model, intent.extend)
  const next =
    intent.kind === 'tab'
      ? stepTab(origin, bounds, intent.backward)
      : stepDelta(origin, intent.dRow, intent.dCol, bounds)

  if (intent.extend) model.selectCell(next, { extend: true })
  else model.selectCell(next)

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
  dRow: number,
  dCol: number,
  bounds: GridIndexBounds,
): CellAddress {
  return {
    rowIndex: clampIndex(origin.rowIndex + dRow, bounds.rowCount),
    colIndex: clampIndex(origin.colIndex + dCol, bounds.colCount),
  }
}

function stepTab(origin: CellAddress, bounds: GridIndexBounds, backward: boolean): CellAddress {
  if (backward) {
    if (origin.colIndex > 0) {
      return { rowIndex: origin.rowIndex, colIndex: origin.colIndex - 1 }
    }
    if (origin.rowIndex > 0) {
      return { rowIndex: origin.rowIndex - 1, colIndex: bounds.colCount - 1 }
    }
    return origin
  }

  if (origin.colIndex < bounds.colCount - 1) {
    return { rowIndex: origin.rowIndex, colIndex: origin.colIndex + 1 }
  }
  if (origin.rowIndex < bounds.rowCount - 1) {
    return { rowIndex: origin.rowIndex + 1, colIndex: 0 }
  }
  return origin
}

function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0
  return Math.max(0, Math.min(count - 1, index))
}
