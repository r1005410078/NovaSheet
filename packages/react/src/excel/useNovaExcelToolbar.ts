import type {
  BorderPreset,
  BorderStyle,
  CellRange,
  GridSelection,
  TextWrapMode,
  ValueFormat,
} from '@novasheet/core'
import { useCallback, useEffect } from 'react'

import type { ToolbarAction, ToolbarActionId, ToolbarStateGridAccess } from '@/features/toolbar'
import { useNovaSheetToolbarState } from '@/features/toolbar'

const INITIAL_RANGE: CellRange = { startRow: 0, endRow: 1, startCol: 0, endCol: 1 }

/** Grid 读能力 + NovaExcel 工具栏 action 所需写能力。 */
export interface NovaExcelToolbarGrid extends ToolbarStateGridAccess {
  setSelection(selection: GridSelection): void
  undo(): void
  redo(): void
  copy(): Promise<boolean>
  cut(): Promise<boolean>
  paste(): Promise<boolean>
  setFillColor(range: CellRange, color: string | null): boolean
  setBorders(range: CellRange, preset: BorderPreset, border: BorderStyle | null): boolean
  mergeCells(range: CellRange): boolean
  unmergeCells(range: CellRange): boolean
  setTextWrap(range: CellRange, mode: TextWrapMode): boolean
  setValueFormat(range: CellRange, valueFormat: ValueFormat): boolean
}

export interface UseNovaExcelToolbarOptions {
  readonly getGrid: () => NovaExcelToolbarGrid | null
  readonly onToolbarAction?: (action: ToolbarAction) => void
}

export interface UseNovaExcelToolbarResult {
  readonly toolbarState: ReturnType<typeof useNovaSheetToolbarState>['toolbarState']
  readonly disabledActionIds: readonly ToolbarActionId[]
  readonly syncToolbarState: () => void
  readonly handleToolbarAction: (action: ToolbarAction) => void
}

export function useNovaExcelToolbar({
  getGrid,
  onToolbarAction,
}: UseNovaExcelToolbarOptions): UseNovaExcelToolbarResult {
  const { toolbarState, canUndo, canRedo, syncToolbarState } = useNovaSheetToolbarState(getGrid)

  const getRange = useCallback((): CellRange | null => {
    const grid = getGrid()
    if (!grid) return null

    const selection = grid.getSelection()
    if (selection.selectedRange) return selection.selectedRange

    grid.setSelection({
      activeCell: { rowIndex: INITIAL_RANGE.startRow, colIndex: INITIAL_RANGE.startCol },
      anchorCell: { rowIndex: INITIAL_RANGE.startRow, colIndex: INITIAL_RANGE.startCol },
      extentCell: { rowIndex: INITIAL_RANGE.endRow, colIndex: INITIAL_RANGE.endCol },
      selectedRange: INITIAL_RANGE,
    })
    return INITIAL_RANGE
  }, [getGrid])

  useEffect(() => {
    getRange()
    syncToolbarState()
  }, [getRange, syncToolbarState])

  const applyRangeAction = useCallback(
    (action: (range: CellRange) => boolean) => {
      const range = getRange()
      if (!range) return
      action(range)
      syncToolbarState()
    },
    [getRange, syncToolbarState],
  )

  const handleToolbarAction = useCallback(
    (action: ToolbarAction) => {
      const grid = getGrid()
      if (!grid) return

      if (action.id === 'undo') {
        grid.undo()
        syncToolbarState()
        onToolbarAction?.(action)
        return
      }
      if (action.id === 'redo') {
        grid.redo()
        syncToolbarState()
        onToolbarAction?.(action)
        return
      }
      if (action.id === 'copy' || action.id === 'cut' || action.id === 'paste') {
        void grid[action.id]().then(() => {
          syncToolbarState()
          onToolbarAction?.(action)
        })
        return
      }
      if (action.id === 'fill-color') {
        applyRangeAction((range) => grid.setFillColor(range, action.color))
        onToolbarAction?.(action)
        return
      }
      if (action.id === 'borders') {
        applyRangeAction((range) => grid.setBorders(range, action.preset, action.border))
        onToolbarAction?.(action)
        return
      }
      if (action.id === 'merge-cells') {
        if (action.mode !== 'all') return
        applyRangeAction((range) => grid.mergeCells(range))
        onToolbarAction?.(action)
        return
      }
      if (action.id === 'unmerge-cells') {
        applyRangeAction((range) => grid.unmergeCells(range))
        onToolbarAction?.(action)
        return
      }
      if (action.id === 'text-wrap') {
        const currentLabel = toolbarState.textWrap ?? '溢出'
        const next: TextWrapMode =
          currentLabel === '溢出' ? 'wrap' : currentLabel === '换行' ? 'clip' : 'overflow'
        applyRangeAction((range) => grid.setTextWrap(range, next))
        onToolbarAction?.(action)
        return
      }
      if (action.id === 'value-format') {
        applyRangeAction((range) => grid.setValueFormat(range, action.format))
        onToolbarAction?.(action)
      }
    },
    [applyRangeAction, getGrid, onToolbarAction, syncToolbarState, toolbarState.textWrap],
  )

  const disabledActionIds = [
    ...(canUndo ? [] : (['undo'] as const)),
    ...(canRedo ? [] : (['redo'] as const)),
  ]

  return { toolbarState, disabledActionIds, syncToolbarState, handleToolbarAction }
}
