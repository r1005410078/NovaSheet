import { CirclePlus, Pipette } from 'lucide-react'

import { fillPaletteRows, standardFillColors } from './colors'
import { TOOLBAR_ICON_CLASS } from './icon-class'

export function ColorSwatch({
  color,
  label,
  selectedColor,
  onSelect,
}: {
  readonly color: string
  readonly label: string
  readonly selectedColor: string | null | undefined
  readonly onSelect: (color: string) => void
}): JSX.Element {
  const selected = selectedColor?.toLowerCase() === color.toLowerCase()

  return (
    <button
      type="button"
      aria-label={label}
      data-fill-color={color}
      className="inline-flex size-5 items-center justify-center justify-self-center rounded-full border border-slate-300 text-[11px] leading-none text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
      style={{ backgroundColor: color }}
      title={label}
      onClick={() => onSelect(color)}
    >
      {selected ? '✓' : null}
    </button>
  )
}

export function SwatchRows({
  rows,
  selectedColor,
  onSelect,
}: {
  readonly rows: readonly (readonly { readonly color: string; readonly label: string }[])[]
  readonly selectedColor: string | null | undefined
  readonly onSelect: (color: string) => void
}): JSX.Element {
  return (
    <div className="grid gap-1">
      {rows.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className={row.length === 10 ? 'grid grid-cols-10 gap-1' : 'grid grid-cols-8 gap-1'}
        >
          {row.map((swatch) => (
            <ColorSwatch
              key={`${swatch.label}-${swatch.color}`}
              color={swatch.color}
              label={swatch.label}
              selectedColor={selectedColor}
              onSelect={onSelect}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Shared spreadsheet color grid used by fill and border pickers. */
export function ToolbarColorPalette({
  selectedColor,
  onSelect,
}: {
  readonly selectedColor: string | null | undefined
  readonly onSelect: (color: string) => void
}): JSX.Element {
  return (
    <>
      <SwatchRows rows={fillPaletteRows} selectedColor={selectedColor} onSelect={onSelect} />

      <div className="mt-2 flex items-center gap-1">
        <span>标准</span>
        <button
          type="button"
          className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          title="吸管"
          onClick={() => onSelect('#000000')}
        >
          <Pipette aria-hidden className={TOOLBAR_ICON_CLASS} strokeWidth={1.75} />
        </button>
      </div>

      <div className="mt-1 grid grid-cols-8 gap-1.5">
        {standardFillColors.map((swatch) => (
          <ColorSwatch
            key={`${swatch.label}-${swatch.color}`}
            color={swatch.color}
            label={swatch.label}
            selectedColor={selectedColor}
            onSelect={onSelect}
          />
        ))}
      </div>
    </>
  )
}

export function ToolbarColorPaletteCustom({
  onSelect,
}: {
  readonly onSelect: (color: string) => void
}): JSX.Element {
  return (
    <>
      <div className="mb-2 text-slate-700">自定义</div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          title="添加自定义颜色"
          onClick={() => onSelect('#fff2cc')}
        >
          <CirclePlus aria-hidden className={TOOLBAR_ICON_CLASS} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          title="吸管"
          onClick={() => onSelect('#000000')}
        >
          <Pipette aria-hidden className={TOOLBAR_ICON_CLASS} strokeWidth={1.75} />
        </button>
      </div>
    </>
  )
}
