import { CirclePlus, Pipette } from 'lucide-react'

import { normalizeColor, parseColor } from '../lib/color-convert'
import { fillPaletteRows, standardFillColors } from '../lib/colors'
import { TOOLBAR_ICON_CLASS } from '../lib/icon-class'
import { CHECKERBOARD_BG } from './CustomColorPicker'

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
  const normalizedSelected =
    selectedColor != null ? (normalizeColor(selectedColor) ?? selectedColor.toLowerCase()) : null
  const selected = normalizedSelected === (normalizeColor(color) ?? color.toLowerCase())
  const translucent = (parseColor(color)?.a ?? 1) < 1

  return (
    <button
      type="button"
      aria-label={label}
      data-fill-color={color}
      className="inline-flex size-5 items-center justify-center justify-self-center rounded-full border border-slate-300 text-[11px] leading-none text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
      style={
        translucent
          ? {
              background: `linear-gradient(${color}, ${color}), ${CHECKERBOARD_BG}`,
              backgroundSize: 'auto, 8px 8px',
            }
          : { backgroundColor: color }
      }
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

interface EyeDropperResult {
  readonly sRGBHex: string
}

/** 自定义区：已存 swatch + 取色器入口 + 吸管（feature-detect）。无 IO，数据由宿主注入。 */
export function ToolbarColorPaletteCustom({
  onSelect,
  onOpenPicker,
  customColors,
  selectedColor,
}: {
  readonly onSelect: (color: string) => void
  readonly onOpenPicker: () => void
  readonly customColors: readonly string[]
  readonly selectedColor?: string | null
}): JSX.Element {
  const eyeDropperCtor = (
    globalThis as { EyeDropper?: new () => { open(): Promise<EyeDropperResult> } }
  ).EyeDropper
  const pickScreenColor = (): void => {
    if (!eyeDropperCtor) return
    new eyeDropperCtor()
      .open()
      .then((result) => onSelect(result.sRGBHex))
      .catch(() => {
        // 用户 Esc 取消——静默忽略
      })
  }

  return (
    <>
      <div className="mb-2 text-slate-700">自定义</div>
      {customColors.length > 0 ? (
        <div className="mb-2 grid grid-cols-10 gap-1">
          {customColors.map((color) => (
            <ColorSwatch
              key={color}
              color={color}
              label={color}
              selectedColor={selectedColor}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-custom-color-add=""
          className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          title="添加自定义颜色"
          onClick={onOpenPicker}
        >
          <CirclePlus aria-hidden className={TOOLBAR_ICON_CLASS} strokeWidth={1.75} />
        </button>
        {eyeDropperCtor ? (
          <button
            type="button"
            data-custom-color-eyedropper=""
            className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            title="吸管"
            onClick={pickScreenColor}
          >
            <Pipette aria-hidden className={TOOLBAR_ICON_CLASS} strokeWidth={1.75} />
          </button>
        ) : null}
      </div>
    </>
  )
}
