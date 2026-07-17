import type { Ref } from 'react'
import type { ValueFormat } from '@zhiguang/novasheet-core'

/** 工具栏值格式预设（Phase 5-C）。raw 值不变，仅改显示。 */
const VALUE_FORMAT_ITEMS: readonly {
  readonly kind: ValueFormat['kind']
  readonly label: string
  readonly format: ValueFormat
}[] = [
  { kind: 'number', label: '千分位', format: { kind: 'number', thousands: true } },
  { kind: 'currency', label: '货币 ¥', format: { kind: 'currency', currency: 'CNY' } },
  { kind: 'percent', label: '百分比', format: { kind: 'percent', decimals: 2 } },
  { kind: 'date', label: '日期', format: { kind: 'date', pattern: 'YYYY-MM-DD' } },
]

export function ValueFormatMenu({
  position,
  menuRef,
  onSelect,
  onClose,
}: {
  readonly position: { top: number; left: number }
  readonly menuRef: Ref<HTMLDivElement>
  readonly onSelect: (format: ValueFormat) => void
  readonly onClose: () => void
}): JSX.Element {
  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="数字格式"
      data-novasheet-value-format-menu=""
      className="fixed z-[10000] min-w-[140px] rounded bg-white py-1 text-[13px] text-slate-800 shadow-lg ring-1 ring-slate-200"
      style={{ top: position.top, left: position.left }}
    >
      {VALUE_FORMAT_ITEMS.map((entry) => (
        <button
          key={entry.kind}
          type="button"
          role="menuitem"
          data-value-format={entry.kind}
          title={entry.label}
          className="block h-8 w-full px-3 text-left hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400"
          onClick={() => {
            onSelect(entry.format)
            onClose()
          }}
        >
          {entry.label}
        </button>
      ))}
    </div>
  )
}
