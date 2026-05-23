/**
 * Phase 4.0 的上下文菜单模型。
 *
 * 包含上下文菜单项的类型定义和生成函数。
 * 根据选择状态和剪贴板可用性决定菜单项的启用/禁用状态。
 */

import type { CellAddress, CellRange } from './SelectionModel'
import type {
  ColumnHeaderMenuContext as PipelineColumnHeaderMenuContext,
} from '../view/ViewLayer'
import type { ViewPipeline } from '../view/ViewPipeline'

export type ContextMenuTargetKind = 'cell' | 'columnHeader'

export type ContextMenuAction =
  | 'cut'
  | 'copy'
  | 'paste'
  | 'sort-asc'
  | 'sort-desc'
  | 'sort-none'
  | 'filter-open'
  | 'filter-clear'

export interface CellMenuContext {
  readonly targetKind: 'cell'
  readonly cell: CellAddress
  readonly selectedRange: CellRange | null
  readonly hasSelection: boolean
  readonly clipboardReady: boolean
}

export interface ColumnHeaderMenuContext extends PipelineColumnHeaderMenuContext {
  readonly multiSelect?: boolean
}

export type ContextMenuContext = CellMenuContext | ColumnHeaderMenuContext

export interface ContextMenuItem {
  readonly id: ContextMenuAction
  readonly label: string
  readonly disabled: boolean
  readonly separatorAfter?: boolean
}

export function getCellContextMenuItems(
  ctx: CellMenuContext,
): readonly ContextMenuItem[] {
  return [
    { id: 'cut', label: 'Cut', disabled: !ctx.hasSelection },
    { id: 'copy', label: 'Copy', disabled: !ctx.hasSelection, separatorAfter: true },
    { id: 'paste', label: 'Paste', disabled: !ctx.clipboardReady },
  ]
}

export function getColumnHeaderContextMenuItems(
  ctx: ColumnHeaderMenuContext,
  pipeline: ViewPipeline,
): readonly ContextMenuItem[] {
  const items = pipeline.collectColumnHeaderMenuItems(ctx)
  if (!ctx.multiSelect) return items
  return items.map((item) =>
    item.id === 'sort-asc' || item.id === 'sort-desc' ? { ...item, disabled: true } : item,
  )
}
