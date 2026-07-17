import type {
  BorderStyle,
  CellFormat,
  GridSelection,
  MergeRegion,
  TextWrapMode,
} from '@zhiguang/core'

import type { NovaSheetToolbarState } from '../types'

/** deriveToolbarStateFromGrid 与 useNovaSheetToolbarState 所需的最小 Grid 读能力。 */
export interface ToolbarStateGridAccess {
  getSelection(): GridSelection
  getViewCellFormat(viewRow: number, viewCol: number): CellFormat | undefined
  getViewMergeRegion(viewRow: number, viewCol: number): MergeRegion | null
  canUndo(): boolean
  canRedo(): boolean
}

const TEXT_WRAP_LABEL: Record<TextWrapMode, string> = {
  overflow: '溢出',
  wrap: '换行',
  clip: '裁剪',
}

function pickBorderStyle(borders: CellFormat['borders']): BorderStyle | undefined {
  if (!borders) return undefined
  return borders.top ?? borders.right ?? borders.bottom ?? borders.left
}

function isMultiCellMerge(mergeRegion: MergeRegion): boolean {
  const { range } = mergeRegion
  return range.startRow !== range.endRow || range.startCol !== range.endCol
}

/** 从 Grid 当前选区（默认 active cell）推导工具栏受控状态。 */
export function deriveToolbarStateFromGrid(
  grid: ToolbarStateGridAccess,
  selection: GridSelection = grid.getSelection(),
): NovaSheetToolbarState {
  const cell = selection.activeCell
  if (!cell) {
    return {
      fillColor: null,
      textWrap: TEXT_WRAP_LABEL.overflow,
      cellsMerged: false,
    }
  }

  const format = grid.getViewCellFormat(cell.rowIndex, cell.colIndex)
  const mergeRegion = grid.getViewMergeRegion(cell.rowIndex, cell.colIndex)
  const borderStyle = pickBorderStyle(format?.borders)

  return {
    fillColor: format?.fillColor ?? null,
    borderStyle,
    lastBorderPreset: borderStyle ? 'all' : undefined,
    textWrap: TEXT_WRAP_LABEL[format?.textWrap ?? 'overflow'],
    cellsMerged: mergeRegion !== null && isMultiCellMerge(mergeRegion),
  }
}
