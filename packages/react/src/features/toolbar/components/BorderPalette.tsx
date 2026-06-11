import type { BorderLineStyle, BorderPreset, BorderStyle } from '@novasheet/core'
import { ChevronDown, PenLine } from 'lucide-react'
import { useEffect, useState, type Ref } from 'react'

import { cn } from '@/lib/utils'
import { useCustomColors } from '../lib/use-custom-colors'
import { TOOLBAR_ICON_CLASS, TOOLBAR_ICON_SM_CLASS } from '../lib/icon-class'
import { ToolbarColorPalette, ToolbarColorPaletteCustom } from './ColorPalette'
import { CustomColorPicker } from './CustomColorPicker'
import { BORDER_PRESET_ROWS, BorderPresetGlyph } from './border-presets'

const LINE_STYLES: readonly { readonly value: BorderLineStyle; readonly label: string }[] = [
  { value: 'solid', label: '实线' },
  { value: 'dashed', label: '虚线' },
  { value: 'dotted', label: '点线' },
  { value: 'double', label: '双线' },
]

const DEFAULT_BORDER: BorderStyle = {
  color: '#000000',
  width: 'thin',
  lineStyle: 'solid',
}

type ActiveBorderPreset = Exclude<BorderPreset, 'clear'>

function LineStylePreview({ lineStyle }: { readonly lineStyle: BorderLineStyle }): JSX.Element {
  const dash =
    lineStyle === 'dashed' ? '4 2' : lineStyle === 'dotted' ? '1 2' : lineStyle === 'double' ? undefined : undefined

  if (lineStyle === 'double') {
    return (
      <svg viewBox="0 0 40 8" aria-hidden className="h-2 w-10">
        <line x1={0} y1={2.5} x2={40} y2={2.5} stroke="currentColor" strokeWidth={1.2} />
        <line x1={0} y1={5.5} x2={40} y2={5.5} stroke="currentColor" strokeWidth={1.2} />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 40 8" aria-hidden className="h-2 w-10">
      <line
        x1={0}
        y1={4}
        x2={40}
        y2={4}
        stroke="currentColor"
        strokeWidth={1.6}
        strokeDasharray={dash}
        strokeLinecap="round"
      />
    </svg>
  )
}

export function BorderPalette({
  position,
  paletteRef,
  borderStyle,
  lastBorderPreset,
  onApply,
  onClose,
}: {
  readonly position: { top: number; left: number }
  readonly paletteRef: Ref<HTMLDivElement>
  readonly borderStyle?: BorderStyle
  readonly lastBorderPreset?: ActiveBorderPreset
  readonly onApply: (preset: BorderPreset, border: BorderStyle | null) => void
  readonly onClose: () => void
}): JSX.Element {
  const [draft, setDraft] = useState<BorderStyle>(borderStyle ?? DEFAULT_BORDER)
  const [lastPreset, setLastPreset] = useState<ActiveBorderPreset | null>(lastBorderPreset ?? null)
  const [colorOpen, setColorOpen] = useState(false)
  const [colorView, setColorView] = useState<'palette' | 'picker'>('palette')
  const [styleOpen, setStyleOpen] = useState(false)
  const { colors: customColors, add: addCustomColor } = useCustomColors()

  useEffect(() => {
    if (borderStyle) setDraft(borderStyle)
  }, [borderStyle])

  useEffect(() => {
    if (lastBorderPreset) setLastPreset(lastBorderPreset)
  }, [lastBorderPreset])

  const applyPreset = (preset: BorderPreset): void => {
    if (preset === 'clear') {
      onApply('clear', null)
      setLastPreset(null)
      onClose()
      return
    }
    onApply(preset, draft)
    setLastPreset(preset)
    onClose()
  }

  const reapplyWithDraft = (nextDraft: BorderStyle): void => {
    setDraft(nextDraft)
    const preset = lastPreset ?? lastBorderPreset ?? null
    if (!preset) return
    onApply(preset, nextDraft)
  }

  const applyDraftColor = (color: string): void => {
    reapplyWithDraft({ ...draft, color })
    setColorOpen(false)
    setColorView('palette')
  }

  return (
    <div
      ref={paletteRef}
      role="menu"
      aria-label="边框"
      data-novasheet-border-palette=""
      className="fixed z-[10000] w-[260px] rounded bg-white text-[13px] text-slate-800 shadow-lg ring-1 ring-slate-200"
      style={{ top: position.top, left: position.left }}
    >
      <div className="flex">
        <div className="grid grid-cols-5 gap-0.5 p-2">
          {BORDER_PRESET_ROWS.flat().map((entry) => (
            <button
              key={entry.preset}
              type="button"
              role="menuitem"
              aria-label={entry.label}
              title={entry.label}
              data-border-preset={entry.preset}
              className="inline-flex size-8 items-center justify-center rounded hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              onClick={() => applyPreset(entry.preset)}
            >
              <BorderPresetGlyph preset={entry.preset} />
            </button>
          ))}
        </div>

        <div aria-hidden className="my-2 w-px bg-slate-200" />

        <div className="flex w-[88px] flex-col gap-1 p-2">
          <button
            type="button"
            aria-expanded={colorOpen}
            aria-haspopup="listbox"
            title="边框颜色"
            className="flex flex-col items-center gap-0.5 rounded px-1 py-1 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            onClick={() => {
              setColorOpen((open) => !open)
              setStyleOpen(false)
            }}
          >
            <span className="inline-flex items-center gap-0.5 text-slate-700">
              <PenLine aria-hidden className={TOOLBAR_ICON_CLASS} strokeWidth={1.75} />
              <ChevronDown aria-hidden className={TOOLBAR_ICON_SM_CLASS} strokeWidth={1.75} />
            </span>
            <span
              aria-hidden
              className="block h-1 w-8 rounded-[1px] ring-1 ring-slate-400/80"
              style={{ backgroundColor: draft.color }}
            />
          </button>

          <button
            type="button"
            aria-expanded={styleOpen}
            aria-haspopup="listbox"
            title="边框线型"
            className="flex flex-col items-center gap-1 rounded px-1 py-1 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            onClick={() => {
              setStyleOpen((open) => !open)
              setColorOpen(false)
            }}
          >
            <LineStylePreview lineStyle={draft.lineStyle} />
            <ChevronDown aria-hidden className={TOOLBAR_ICON_SM_CLASS} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {colorOpen ? (
        <div className="border-t border-slate-200 p-3" data-novasheet-border-color-palette="">
          {colorView === 'picker' ? (
            <CustomColorPicker
              initialColor={draft.color}
              onConfirm={(color) => {
                addCustomColor(color)
                applyDraftColor(color)
              }}
              onCancel={() => setColorView('palette')}
            />
          ) : (
            <>
              <ToolbarColorPalette selectedColor={draft.color} onSelect={applyDraftColor} />
              <div className="my-3 h-px bg-slate-300" />
              <ToolbarColorPaletteCustom
                onSelect={applyDraftColor}
                onOpenPicker={() => setColorView('picker')}
                customColors={customColors}
                selectedColor={draft.color}
              />
            </>
          )}
        </div>
      ) : null}

      {styleOpen ? (
        <div className="border-t border-slate-200 px-2 py-1">
          {LINE_STYLES.map((entry) => (
            <button
              key={entry.value}
              type="button"
              role="menuitem"
              aria-label={entry.label}
              title={entry.label}
              data-border-line-style={entry.value}
              className={cn(
                'flex h-8 w-full items-center justify-center rounded hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
                draft.lineStyle === entry.value && 'bg-slate-100',
              )}
              onClick={() => {
                reapplyWithDraft({ ...draft, lineStyle: entry.value })
                setStyleOpen(false)
              }}
            >
              <LineStylePreview lineStyle={entry.value} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export { DEFAULT_BORDER }