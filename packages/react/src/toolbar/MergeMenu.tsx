import type { Ref } from 'react'

import { cn } from '../lib/utils'

export type MergeMenuMode = 'all' | 'vertical' | 'horizontal'

const MERGE_MENU_ITEMS: readonly {
  readonly mode: MergeMenuMode | 'unmerge'
  readonly label: string
  readonly enabled: boolean
}[] = [
  { mode: 'all', label: '全部合并', enabled: true },
  { mode: 'vertical', label: '垂直合并', enabled: false },
  { mode: 'horizontal', label: '水平合并', enabled: false },
  { mode: 'unmerge', label: '取消合并', enabled: true },
]

export function MergeMenu({
  position,
  menuRef,
  onSelect,
  onClose,
}: {
  readonly position: { top: number; left: number }
  readonly menuRef: Ref<HTMLDivElement>
  readonly onSelect: (mode: MergeMenuMode | 'unmerge') => void
  readonly onClose: () => void
}): JSX.Element {
  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="合并单元格"
      data-novasheet-merge-menu=""
      className="fixed z-[10000] min-w-[132px] rounded bg-white py-1 text-[13px] text-slate-800 shadow-lg ring-1 ring-slate-200"
      style={{ top: position.top, left: position.left }}
    >
      {MERGE_MENU_ITEMS.map((entry) => (
        <button
          key={entry.mode}
          type="button"
          role="menuitem"
          data-merge-mode={entry.mode}
          title={entry.enabled ? entry.label : `${entry.label}（即将支持）`}
          disabled={!entry.enabled}
          className={cn(
            'block h-8 w-full px-3 text-left',
            entry.enabled
              ? 'hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400'
              : 'cursor-not-allowed text-slate-400',
          )}
          onClick={() => {
            if (!entry.enabled) return
            onSelect(entry.mode)
            onClose()
          }}
        >
          {entry.label}
        </button>
      ))}
    </div>
  )
}
