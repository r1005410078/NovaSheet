import type { BorderPreset, BorderStyle } from '@novasheet/core'
import type { ReactNode } from 'react'

export type ToolbarActionId =
  | 'undo'
  | 'redo'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'zoom'
  | 'fill-color'
  | 'borders'
  | 'merge-cells'
  | 'unmerge-cells'
  | 'text-wrap'

export type ToolbarControlId = ToolbarActionId | 'menu-search'

export type ToolbarAction =
  | {
      readonly id: Exclude<ToolbarActionId, 'fill-color' | 'borders' | 'merge-cells'>
    }
  | {
      readonly id: 'fill-color'
      readonly color: string | null
    }
  | {
      readonly id: 'borders'
      readonly preset: BorderPreset
      readonly border: BorderStyle | null
    }
  | {
      readonly id: 'merge-cells'
      readonly mode: MergeCellsMode
    }

export interface ToolbarItem {
  readonly id: ToolbarControlId
  readonly kind: 'search' | 'button' | 'select' | 'stepper'
  readonly label: string
  readonly icon?: ReactNode
  readonly value?: string
  readonly separatorBefore?: boolean
}

export interface NovaSheetToolbarState {
  readonly zoom?: string
  readonly fillColor?: string | null
  readonly borderStyle?: BorderStyle
  /** 最近一次成功应用的边框 preset；改色/改线型时用于重绘已有边框。 */
  readonly lastBorderPreset?: Exclude<BorderPreset, 'clear'>
  readonly textWrap?: string
  /** 当前选区是否已合并；供外部状态同步，合并控件本身为下拉菜单。 */
  readonly cellsMerged?: boolean
}

export interface NovaSheetToolbarProps {
  readonly ariaLabel?: string
  readonly className?: string
  readonly state?: NovaSheetToolbarState
  readonly disabledActionIds?: readonly ToolbarActionId[]
  readonly onAction?: (action: ToolbarAction) => void
  readonly onMenuSearchChange?: (value: string) => void
}

export type ToolbarPopoverId = 'fill-color' | 'borders' | 'merge-cells'

export type MergeCellsMode = 'all' | 'vertical' | 'horizontal'
