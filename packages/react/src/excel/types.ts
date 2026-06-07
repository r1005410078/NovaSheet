import type { GridSelection, RedoEvent, UndoEvent } from '@novasheet/core'
import type { NovaSheetGridProps, NovaSheetGridRef } from '../grid/types'
import type { ToolbarAction } from '../toolbar/types'

export type NovaExcelRef = NovaSheetGridRef

export interface NovaExcelProps extends Omit<NovaSheetGridProps, 'className' | 'excelHeaders'> {
  /** Root shell wrapping toolbar + grid. */
  readonly className?: string
  /** ClassName passed to the inner NovaSheetGrid viewport. */
  readonly gridClassName?: string
  readonly toolbarClassName?: string
  /** Excel-style A/B column headers and 1-based row numbers. Default `true`. */
  readonly excelHeaders?: boolean
  /** Built-in NovaSheetToolbar. Default `true`. */
  readonly showToolbar?: boolean
  /** Zoom label shown in the toolbar. Default `100%`. */
  readonly toolbarZoom?: string
  /** Fired after NovaExcel applies a toolbar action to the grid. */
  readonly onToolbarAction?: (action: ToolbarAction) => void
  /** 选区变化时触发；NovaExcel 会在回调后同步工具栏状态。 */
  readonly onSelectionChange?: (selection: GridSelection) => void
  readonly onUndo?: (event: UndoEvent) => void
  readonly onRedo?: (event: RedoEvent) => void
}
