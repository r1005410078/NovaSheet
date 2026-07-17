import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import {
  CustomColorPicker,
  ToolbarColorPalette,
  ToolbarColorPaletteCustom,
  type ToolbarExtensionItem,
} from '@zhiguang/novasheet-react'
import type { RichTextToolbarController } from './RichTextToolbarProvider'

const RICH_TEXT_TOOLBAR_GROUP_CLASS = 'inline-flex flex-none items-center gap-0.5'
const RICH_TEXT_TOOLBAR_BUTTON_CLASS = 'inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded border-0 bg-transparent px-1.5 text-[13px] leading-none text-slate-700 transition-colors hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45'
const RICH_TEXT_COLOR_PICKER_CLASS = 'fixed z-[10000] w-[260px] rounded bg-white p-3 text-[13px] text-slate-800 shadow-lg ring-1 ring-slate-200'

function commandButton(
  label: string,
  command: string,
  disabled: boolean,
  onClick: () => void,
  title = label,
): JSX.Element {
  return (
    <button
      type="button"
      data-rich-text-command={command}
      disabled={disabled}
      title={title}
      className={RICH_TEXT_TOOLBAR_BUTTON_CLASS}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

export function richTextToolbarExtension(
  controller: RichTextToolbarController,
): ToolbarExtensionItem {
  return {
    id: 'rich-text',
    separatorBefore: true,
    render: () => <RichTextToolbarControls controller={controller} />,
  }
}

function RichTextToolbarControls({
  controller,
}: {
  readonly controller: RichTextToolbarController
}): JSX.Element {
  const colorButtonRef = useRef<HTMLButtonElement>(null)
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const [colorPickerPosition, setColorPickerPosition] = useState<{ top: number; left: number } | null>(null)
  const [colorPickerView, setColorPickerView] = useState<'palette' | 'picker'>('palette')
  const [customColors, setCustomColors] = useState<readonly string[]>([])
  const session = useSyncExternalStore(
    controller.subscribe,
    controller.getSession,
    controller.getSession,
  )
  const disabled = !session
  const activeColor = session?.getActiveAttrs().color ?? '#000000'

  const applyTextColor = (color: string): void => {
    session?.setColor(color)
    setColorPickerOpen(false)
  }

  const addCustomColor = (color: string): void => {
    setCustomColors((colors) => {
      if (colors.includes(color)) return colors
      return [color, ...colors].slice(0, 10)
    })
  }

  useLayoutEffect(() => {
    if (!colorPickerOpen) {
      setColorPickerPosition(null)
      return
    }

    const button = colorButtonRef.current
    if (!button) return

    const update = (): void => {
      const rect = button.getBoundingClientRect()
      setColorPickerPosition({ top: rect.bottom + 4, left: rect.left })
    }

    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [colorPickerOpen])

  return (
    <span
      data-rich-text-toolbar=""
      role="group"
      aria-label="富文本"
      className={RICH_TEXT_TOOLBAR_GROUP_CLASS}
    >
      {commandButton('B', 'bold', disabled, () => session?.toggleInlineStyle('bold'))}
      {commandButton('I', 'italic', disabled, () => session?.toggleInlineStyle('italic'))}
      {commandButton('U', 'underline', disabled, () =>
        session?.toggleInlineStyle('underline'),
      )}
      {commandButton('S', 'strikethrough', disabled, () =>
        session?.toggleInlineStyle('strikethrough'),
      )}
      {commandButton('A+', 'font-size-inc', disabled, () => {
        const current = session?.getActiveAttrs().fontSize ?? 14
        session?.setFontSize(Math.min(96, current + 2))
      })}
      {commandButton('A-', 'font-size-dec', disabled, () => {
        const current = session?.getActiveAttrs().fontSize ?? 14
        session?.setFontSize(Math.max(8, current - 2))
      })}
      <button
        ref={colorButtonRef}
        type="button"
        data-rich-text-command="color"
        disabled={disabled}
        title="文字颜色"
        className={RICH_TEXT_TOOLBAR_BUTTON_CLASS}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (disabled) return
          setColorPickerView('palette')
          setColorPickerOpen((open) => !open)
        }}
      >
        <span
          data-rich-text-color-indicator=""
          className="border-b-2 px-0.5 leading-none"
          style={{ borderBottomColor: activeColor }}
        >
          A
        </span>
      </button>
      {colorPickerOpen && colorPickerPosition && typeof document !== 'undefined'
        ? createPortal(
            <div
              data-rich-text-color-picker=""
              className={RICH_TEXT_COLOR_PICKER_CLASS}
              style={{ top: colorPickerPosition.top, left: colorPickerPosition.left }}
              onMouseDown={(event) => {
                const target = event.target
                if (target instanceof HTMLInputElement) return
                event.preventDefault()
              }}
            >
              {colorPickerView === 'picker' ? (
                <CustomColorPicker
                  initialColor={activeColor}
                  onConfirm={(color) => {
                    addCustomColor(color)
                    applyTextColor(color)
                  }}
                  onCancel={() => setColorPickerView('palette')}
                />
              ) : (
                <>
                  <button
                    type="button"
                    className="mb-2 flex h-7 w-full items-center gap-2 rounded px-1.5 text-left hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                    title="重置文字颜色"
                    onClick={() => applyTextColor('#000000')}
                  >
                    <span aria-hidden className="text-[15px] leading-none">A</span>
                    <span>重置</span>
                  </button>

                  <ToolbarColorPalette selectedColor={activeColor} onSelect={applyTextColor} />

                  <div className="my-3 h-px bg-slate-300" />

                  <div data-rich-text-custom-color-section="">
                    <ToolbarColorPaletteCustom
                      onSelect={applyTextColor}
                      onOpenPicker={() => setColorPickerView('picker')}
                      customColors={customColors}
                      selectedColor={activeColor}
                    />
                  </div>
                </>
              )}
            </div>,
            document.body,
          )
        : null}
    </span>
  )
}
