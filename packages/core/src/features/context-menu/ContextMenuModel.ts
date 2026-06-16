/**
 * Phase 4.0 的上下文菜单模型。
 *
 * 包含上下文菜单项的类型定义和生成函数。
 * 根据选择状态和剪贴板可用性决定菜单项的启用/禁用状态。
 */

import type { CellAddress, CellRange } from '../../kernel/coords/SelectionTypes'
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
  | 'insert-col-left'
  | 'insert-col-right'
  | 'delete-cols'
  | 'hide-cols'
  | 'unhide-cols'
  | 'resize-column-width'
  | 'insert-above'
  | 'insert-below'
  | 'delete-rows'
  | 'hide-rows'
  | 'unhide-rows'
  | 'resize-row-height'

export type BuiltInMenuIconName =
  | 'cut'
  | 'copy'
  | 'paste'
  | 'plus'
  | 'trash'
  // TODO(header-menu): 'clear' 用于取消隐藏操作图标；'more' 用于子菜单项
  | 'clear'
  | 'hide'
  | 'resize'
  | 'filter'
  | 'sortAsc'
  | 'sortDesc'
  | 'more'

export type MenuIcon =
  | { readonly kind: 'builtin'; readonly name: BuiltInMenuIconName }
  | { readonly kind: 'svg-path'; readonly path: string }
  | { readonly kind: 'text'; readonly text: string }

export interface CellMenuContext {
  readonly targetKind: 'cell'
  readonly cell: CellAddress
  readonly selectedRange: CellRange | null
  readonly hasSelection: boolean
  readonly clipboardReady: boolean
}

export interface ColumnHeaderMenuContext extends PipelineColumnHeaderMenuContext {
  readonly multiSelect?: boolean
  readonly selectedColCount?: number
  readonly hasHiddenInSelection?: boolean
}

/** Phase 4.5 — 行头右键菜单上下文。 */
export interface RowHeaderMenuContext {
  readonly targetKind: 'rowHeader'
  readonly targetRowIndex: number
}

export type ContextMenuContext = CellMenuContext | ColumnHeaderMenuContext | RowHeaderMenuContext

export interface ContextMenuItem {
  readonly id: ContextMenuAction | (string & {})
  readonly label: string
  readonly disabled?: boolean
  readonly icon?: MenuIcon
  readonly shortcut?: string
  readonly category?: string
  readonly separatorAfter?: boolean
  readonly submenu?: readonly ContextMenuItem[]
}

export interface ContextMenuExtensionConfig {
  readonly cell?: ContextMenuConfig
  readonly columnHeader?: ContextMenuConfig
  readonly rowHeader?: ContextMenuConfig
}

export interface ContextMenuConfig {
  readonly mode?: 'append' | 'prepend' | 'replace'
  readonly items?: readonly ContextMenuItem[]
  transform?(
    items: readonly ContextMenuItem[],
    ctx: ContextMenuContext,
  ): readonly ContextMenuItem[]
}

export function applyContextMenuConfig(
  baseItems: readonly ContextMenuItem[],
  ctx: ContextMenuContext,
  config: ContextMenuConfig | undefined,
): readonly ContextMenuItem[] {
  if (!config) return baseItems
  const extra = config.items ?? []
  const mode = config.mode ?? 'append'
  const merged =
    mode === 'replace'
      ? [...extra]
      : mode === 'prepend'
        ? [...extra, ...baseItems]
        : [...baseItems, ...extra]
  return config.transform ? config.transform(merged, ctx) : merged
}

// no navigator in bun test, safe fallback false
const isMac =
  typeof navigator !== 'undefined' && /\bMac|iPhone|iPad|iPod\b/.test(navigator.platform)

function shortcut(mac: string, other: string): string {
  return isMac ? mac : other
}

function builtinIcon(name: BuiltInMenuIconName): MenuIcon {
  return { kind: 'builtin', name }
}

export function getCellContextMenuItems(ctx: CellMenuContext): readonly ContextMenuItem[] {
  return [
    {
      id: 'cut',
      label: '剪切',
      disabled: !ctx.hasSelection,
      icon: builtinIcon('cut'),
      shortcut: shortcut('⌘X', 'Ctrl+X'),
      category: 'clipboard',
    },
    {
      id: 'copy',
      label: '复制',
      disabled: !ctx.hasSelection,
      icon: builtinIcon('copy'),
      shortcut: shortcut('⌘C', 'Ctrl+C'),
      category: 'clipboard',
      separatorAfter: true,
    },
    {
      id: 'paste',
      label: '粘贴',
      disabled: !ctx.clipboardReady,
      icon: builtinIcon('paste'),
      shortcut: shortcut('⌘V', 'Ctrl+V'),
      category: 'clipboard',
    },
  ]
}

export function getColumnHeaderContextMenuItems(
  ctx: ColumnHeaderMenuContext,
  pipeline: ViewPipeline,
): readonly ContextMenuItem[] {
  const pipelineItems = pipeline.collectColumnHeaderMenuItems(ctx)
  const items = ctx.multiSelect
    ? pipelineItems.map((item) =>
        item.id === 'sort-asc' || item.id === 'sort-desc' ? { ...item, disabled: true } : item,
      )
    : pipelineItems
  const merged = [...items]
  if (merged.length > 0) {
    const last = merged[merged.length - 1]!
    merged[merged.length - 1] = { ...last, separatorAfter: true }
  }
  merged.push(
    ...getColumnHeaderStructuralMenuItems(
      ctx.selectedColCount ?? 1,
      ctx.hasHiddenInSelection ?? false,
    ),
  )
  return merged
}

/** Phase 4.6 — 生成列头结构操作菜单项（追加在 sort/filter 之后）。 */
export function getColumnHeaderStructuralMenuItems(
  n: number,
  hasHiddenInSelection: boolean,
): readonly ContextMenuItem[] {
  const items: ContextMenuItem[] = [
    {
      id: 'insert-col-left',
      label: `在左侧插入 ${n} 列`,
      disabled: false,
      icon: builtinIcon('plus'),
      category: 'structure',
      separatorAfter: false,
    },
    {
      id: 'insert-col-right',
      label: `在右侧插入 ${n} 列`,
      disabled: false,
      icon: builtinIcon('plus'),
      category: 'structure',
      separatorAfter: true,
    },
    {
      id: 'delete-cols',
      label: `删除 ${n} 列`,
      disabled: false,
      icon: builtinIcon('trash'),
      category: 'structure',
      separatorAfter: false,
    },
    {
      id: 'hide-cols',
      label: `隐藏 ${n} 列`,
      disabled: false,
      icon: builtinIcon('hide'),
      category: 'structure',
      separatorAfter: false,
    },
  ]
  if (hasHiddenInSelection) {
    items.push({
      id: 'unhide-cols',
      label: '显示选区内隐藏列',
      disabled: false,
      icon: builtinIcon('clear'),
      category: 'structure',
      separatorAfter: false,
    })
  }
  items.push({
    id: 'resize-column-width',
    label: '调整列宽…',
    disabled: false,
    icon: builtinIcon('resize'),
    category: 'structure',
    separatorAfter: false,
  })
  const resizeIdx = items.findIndex((item) => item.id === 'resize-column-width')
  if (resizeIdx > 0) {
    const prev = items[resizeIdx - 1]!
    items[resizeIdx - 1] = { ...prev, separatorAfter: true }
  }
  return items
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
    {
      id: 'insert-above',
      label: `在上方插入 ${n} 行`,
      disabled: false,
      icon: builtinIcon('plus'),
      category: 'structure',
      separatorAfter: false,
    },
    {
      id: 'insert-below',
      label: `在下方插入 ${n} 行`,
      disabled: false,
      icon: builtinIcon('plus'),
      category: 'structure',
      separatorAfter: true,
    },
    {
      id: 'delete-rows',
      label: `删除 ${n} 行`,
      disabled: false,
      icon: builtinIcon('trash'),
      category: 'structure',
      separatorAfter: false,
    },
    {
      id: 'hide-rows',
      label: `隐藏 ${n} 行`,
      disabled: false,
      icon: builtinIcon('hide'),
      category: 'structure',
      separatorAfter: false,
    },
  ]
  if (hasHiddenInSelection) {
    items.push({
      id: 'unhide-rows',
      label: '显示选区内隐藏行',
      disabled: false,
      icon: builtinIcon('clear'),
      category: 'structure',
      separatorAfter: false,
    })
  }
  items.push({
    id: 'resize-row-height',
    label: '调整行高…',
    disabled: false,
    icon: builtinIcon('resize'),
    category: 'structure',
    separatorAfter: false,
  })
  // mark separator after hide-rows (or unhide-rows) before resize-row-height
  const resizeIdx = items.findIndex((i) => i.id === 'resize-row-height')
  if (resizeIdx > 0) {
    const prev = items[resizeIdx - 1]!
    items[resizeIdx - 1] = { ...prev, separatorAfter: true }
  }
  return items
}
