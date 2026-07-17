import type { BorderPreset, BorderStyle, ValueFormat } from '@zhiguang/novasheet-core'
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
  | 'value-format'

export type ToolbarControlId = ToolbarActionId | 'menu-search'

export type ToolbarAction =
  | {
      readonly id: Exclude<
        ToolbarActionId,
        'fill-color' | 'borders' | 'merge-cells' | 'value-format'
      >
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
  | {
      readonly id: 'value-format'
      readonly format: ValueFormat
    }

interface ToolbarItemBase {
  readonly label: string
  readonly icon?: ReactNode
  readonly value?: string
  readonly separatorBefore?: boolean
}

export interface ToolbarSearchItem extends ToolbarItemBase {
  readonly id: 'menu-search'
  readonly kind: 'search'
}

export interface ToolbarActionItem extends ToolbarItemBase {
  readonly id: ToolbarActionId
  readonly kind: 'button' | 'select' | 'stepper'
}

export type ToolbarItem = ToolbarSearchItem | ToolbarActionItem

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

export interface ToolbarRenderContext {
  readonly state?: NovaSheetToolbarState
  readonly disabledActionIds: ReadonlySet<ToolbarActionId>
  readonly closePopover: () => void
}

export interface ToolbarExtensionItem {
  readonly id: string
  readonly separatorBefore?: boolean
  render(ctx: ToolbarRenderContext): ReactNode
}

export interface NovaSheetToolbarProps {
  readonly ariaLabel?: string
  readonly className?: string
  readonly state?: NovaSheetToolbarState
  readonly disabledActionIds?: readonly ToolbarActionId[]
  readonly onAction?: (action: ToolbarAction) => void
  readonly onMenuSearchChange?: (value: string) => void
  readonly items?: readonly ToolbarItem[]
  readonly extensionItems?: readonly ToolbarExtensionItem[]
}

export type ToolbarPopoverId = 'fill-color' | 'borders' | 'merge-cells' | 'value-format'

export type MergeCellsMode = 'all' | 'vertical' | 'horizontal'
