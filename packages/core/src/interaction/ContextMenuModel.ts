/**
 * Phase 4.0 的上下文菜单模型。
 *
 * 包含上下文菜单项的类型定义和生成函数。
 * 根据选择状态和剪贴板可用性决定菜单项的启用/禁用状态。
 */

import type { CellAddress, CellRange } from './SelectionModel'
import type { ColumnHeaderMenuContext as PipelineColumnHeaderMenuContext } from '../view/ViewLayer'
import type { ViewPipeline } from '../view/ViewPipeline'

export type ContextMenuTargetKind = 'cell' | 'columnHeader' | 'rowHeader'

export type ContextMenuAction =
  | 'cut'
  | 'copy'
  | 'paste'
  | 'sort-asc'
  | 'sort-desc'
  | 'sort-none'
  | 'filter-open'
  | 'filter-clear'
  | 'insert-above'
  | 'insert-below'
  | 'delete-rows'
  | 'hide-rows'
  | 'unhide-rows'
  | 'resize-row-height'

export interface CellMenuContext {
  readonly targetKind?: 'cell'
  readonly cell: CellAddress
  readonly selectedRange: CellRange | null
  readonly hasSelection: boolean
  readonly clipboardReady: boolean
}

export interface ColumnHeaderMenuContext extends PipelineColumnHeaderMenuContext {
  readonly multiSelect?: boolean
}

/** Phase 4.5 — 行头右键菜单上下文。 */
export interface RowHeaderMenuContext {
  readonly targetKind: 'rowHeader'
  readonly targetRowIndex: number
}

export type ContextMenuContext = CellMenuContext | ColumnHeaderMenuContext | RowHeaderMenuContext

export interface ContextMenuItem {
  readonly id: ContextMenuAction
  readonly label: string
  readonly disabled: boolean
  readonly separatorAfter?: boolean
}

export function getCellContextMenuItems(ctx: CellMenuContext): readonly ContextMenuItem[] {
  return [
    { id: 'cut', label: '剪切', disabled: !ctx.hasSelection },
    { id: 'copy', label: '复制', disabled: !ctx.hasSelection, separatorAfter: true },
    { id: 'paste', label: '粘贴', disabled: !ctx.clipboardReady },
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

/** Phase 4.5 — 生成行头右键菜单项列表。
 *
 * @param n 选区行数（影响 label 里的行数显示）
 * @param hasHiddenInSelection 选区范围内是否有隐藏行（决定是否出现 unhide-rows 项）
 */
export function getRowHeaderContextMenuItems(
  n: number,
  hasHiddenInSelection: boolean,
): readonly ContextMenuItem[] {
  const items: ContextMenuItem[] = [
    { id: 'insert-above', label: `在上方插入 ${n} 行`, disabled: false, separatorAfter: false },
    { id: 'insert-below', label: `在下方插入 ${n} 行`, disabled: false, separatorAfter: true },
    { id: 'delete-rows', label: `删除 ${n} 行`, disabled: false, separatorAfter: false },
    { id: 'hide-rows', label: `隐藏 ${n} 行`, disabled: false, separatorAfter: false },
  ]
  if (hasHiddenInSelection) {
    items.push({ id: 'unhide-rows', label: '显示选区内隐藏行', disabled: false, separatorAfter: false })
  }
  items.push({ id: 'resize-row-height', label: '调整行高…', disabled: false, separatorAfter: false })
  // mark separator after hide-rows (or unhide-rows) before resize-row-height
  const resizeIdx = items.findIndex((i) => i.id === 'resize-row-height')
  if (resizeIdx > 0) {
    const prev = items[resizeIdx - 1]!
    items[resizeIdx - 1] = { ...prev, separatorAfter: true }
  }
  return items
}
