/**
 * Phase 4.0 的上下文菜单模型。
 *
 * 包含上下文菜单项的类型定义和生成函数。
 * 根据选择状态和剪贴板可用性决定菜单项的启用/禁用状态。
 */

import type { CellAddress, CellRange } from './SelectionModel'

export type ContextMenuAction = 'cut' | 'copy' | 'paste'

export interface ContextMenuContext {
  readonly cell: CellAddress
  readonly selectedRange: CellRange | null
  readonly hasSelection: boolean
  readonly clipboardReady: boolean
}

export interface ContextMenuItem {
  readonly id: ContextMenuAction
  readonly label: string
  readonly disabled: boolean
  readonly separatorAfter?: boolean
}

export function getCellContextMenuItems(
  ctx: ContextMenuContext,
): readonly ContextMenuItem[] {
  return [
    { id: 'cut', label: 'Cut', disabled: !ctx.hasSelection },
    { id: 'copy', label: 'Copy', disabled: !ctx.hasSelection, separatorAfter: true },
    { id: 'paste', label: 'Paste', disabled: !ctx.clipboardReady },
  ]
}
