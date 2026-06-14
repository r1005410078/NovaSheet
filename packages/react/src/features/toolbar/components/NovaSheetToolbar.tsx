import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type Ref,
  type RefObject,
  type SetStateAction,
} from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Eraser, Search } from 'lucide-react'

import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { cn } from '@/lib/utils'
import { BorderPalette } from './BorderPalette'
import { CustomColorPicker } from './CustomColorPicker'
import { MergeMenu } from './MergeMenu'
import { SplitPopoverButton } from './SplitPopoverButton'
import { ValueFormatMenu } from './ValueFormatMenu'
import {
  ToolbarColorPalette,
  ToolbarColorPaletteCustom,
} from './ColorPalette'
import { useCustomColors } from '../lib/use-custom-colors'
import { defaultToolbarItems, FillColorIcon } from './items'
import { TOOLBAR_ICON_CLASS, TOOLBAR_ICON_SM_CLASS } from '../lib/icon-class'
import { primaryMergeToolbarAction } from '../lib/toolbar-primary-actions'
import type {
  NovaSheetToolbarProps,
  ToolbarActionId,
  ToolbarItem,
  ToolbarPopoverId,
  ToolbarRenderContext,
} from '../types'

type CommandToolbarActionId = Exclude<
  ToolbarActionId,
  'fill-color' | 'borders' | 'merge-cells' | 'value-format'
>

function useFixedAnchorPosition(
  anchorRef: RefObject<HTMLElement | null>,
  open: boolean,
): { top: number; left: number } | null {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      return
    }

    const anchor = anchorRef.current
    if (!anchor) return

    const update = (): void => {
      const rect = anchor.getBoundingClientRect()
      setPosition({ top: rect.bottom + 4, left: rect.left })
    }

    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [anchorRef, open])

  return position
}

function resolveValue(
  item: ToolbarItem,
  state: NovaSheetToolbarProps['state'],
): string | undefined {
  if (item.id === 'zoom') return state?.zoom ?? item.value
  if (item.id === 'text-wrap') return state?.textWrap ?? item.value
  return item.value
}

function FillColorPalette({
  position,
  paletteRef,
  selectedColor,
  onAction,
  onClose,
}: {
  readonly position: { top: number; left: number }
  readonly paletteRef: Ref<HTMLDivElement>
  readonly selectedColor: string | null | undefined
  readonly onAction: NovaSheetToolbarProps['onAction']
  readonly onClose: () => void
}): JSX.Element {
  const [view, setView] = useState<'palette' | 'picker'>('palette')
  const { colors: customColors, add: addCustomColor } = useCustomColors()

  const dispatchColor = (color: string | null): void => {
    onAction?.({ id: 'fill-color', color })
    onClose()
  }

  return (
    <div
      ref={paletteRef}
      role="menu"
      aria-label="填充颜色"
      data-novasheet-fill-palette=""
      className="fixed z-[10000] w-[260px] rounded bg-white p-3 text-[13px] text-slate-800 shadow-lg ring-1 ring-slate-200"
      style={{ top: position.top, left: position.left }}
    >
      {view === 'picker' ? (
        <CustomColorPicker
          initialColor={selectedColor ?? '#000000'}
          onConfirm={(color) => {
            addCustomColor(color)
            dispatchColor(color)
          }}
          onCancel={() => setView('palette')}
        />
      ) : (
        <>
          <button
            type="button"
            className="mb-2 flex h-7 w-full items-center gap-2 rounded px-1.5 text-left hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            title="重置填充颜色"
            onClick={() => dispatchColor(null)}
          >
            <Eraser aria-hidden className={TOOLBAR_ICON_CLASS} strokeWidth={1.75} />
            <span>重置</span>
          </button>

          <ToolbarColorPalette selectedColor={selectedColor} onSelect={dispatchColor} />

          <div className="my-3 h-px bg-slate-300" />

          <ToolbarColorPaletteCustom
            onSelect={dispatchColor}
            onOpenPicker={() => setView('picker')}
            customColors={customColors}
            selectedColor={selectedColor}
          />

          <div className="my-3 h-px bg-slate-300" />

          <button
            type="button"
            className="block h-8 w-full rounded px-1.5 text-left hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            title="条件格式"
            onClick={onClose}
          >
            条件格式
          </button>
          <button
            type="button"
            className="block h-8 w-full rounded px-1.5 text-left hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            title="交替颜色"
            onClick={onClose}
          >
            交替颜色
          </button>
        </>
      )}
    </div>
  )
}

function ToolbarItemControl({
  item,
  state,
  disabled,
  onAction,
  onMenuSearchChange,
  openPopoverId,
  setOpenPopoverId,
  popoverAnchorRef,
}: {
  readonly item: ToolbarItem
  readonly state: NovaSheetToolbarProps['state']
  readonly disabled: ReadonlySet<ToolbarActionId>
  readonly onAction: NovaSheetToolbarProps['onAction']
  readonly onMenuSearchChange: NovaSheetToolbarProps['onMenuSearchChange']
  readonly openPopoverId: ToolbarPopoverId | null
  readonly setOpenPopoverId: Dispatch<SetStateAction<ToolbarPopoverId | null>>
  readonly popoverAnchorRef?: Ref<HTMLSpanElement>
}): JSX.Element {
  if (item.kind === 'search') {
    return (
      <label className="relative mr-2 inline-flex items-center">
        <span
          aria-hidden
          className="pointer-events-none absolute left-2.5 inline-flex text-slate-500"
        >
          <Search aria-hidden className={TOOLBAR_ICON_CLASS} strokeWidth={1.75} />
        </span>
        <Input
          aria-label={item.label}
          placeholder="菜单"
          title={item.label}
          onChange={(event) => onMenuSearchChange?.(event.currentTarget.value)}
        />
      </label>
    )
  }

  const actionId = item.id
  const isDisabled = disabled.has(actionId)
  const value = resolveValue(item, state)
  const control = item.kind === 'stepper' ? 'stepper' : item.kind === 'select' ? 'select' : 'button'
  const isFillColor = item.id === 'fill-color'
  const isBorders = item.id === 'borders'
  const isMergeCells = item.id === 'merge-cells'
  const isValueFormat = item.id === 'value-format'
  const hasPopover = isFillColor || isBorders || isMergeCells || isValueFormat
  const isPopoverOpen =
    (isFillColor && openPopoverId === 'fill-color') ||
    (isBorders && openPopoverId === 'borders') ||
    (isMergeCells && openPopoverId === 'merge-cells') ||
    (isValueFormat && openPopoverId === 'value-format')

  if (isMergeCells) {
    return (
      <SplitPopoverButton
        anchorRef={popoverAnchorRef}
        actionId={actionId}
        controlId={item.id}
        label={item.label}
        disabled={isDisabled}
        isOpen={isPopoverOpen}
        onPrimary={() => onAction?.(primaryMergeToolbarAction())}
        onToggleMenu={() =>
          setOpenPopoverId((current) => (current === 'merge-cells' ? null : 'merge-cells'))
        }
      >
        {item.icon ? <span aria-hidden>{item.icon}</span> : null}
      </SplitPopoverButton>
    )
  }

  return (
    <span ref={popoverAnchorRef} className="relative inline-flex flex-none">
      <Button
        aria-expanded={hasPopover ? isPopoverOpen : undefined}
        aria-haspopup={hasPopover ? 'menu' : undefined}
        aria-label={item.label}
        data-action-id={actionId}
        data-control-id={item.id}
        disabled={isDisabled}
        title={item.label}
        variant={item.kind === 'stepper' ? 'outline' : 'ghost'}
        control={control}
        className={hasPopover ? 'min-w-9 px-1' : undefined}
        onClick={() => {
          if (isDisabled) return
          if (isFillColor) {
            setOpenPopoverId((current) => (current === 'fill-color' ? null : 'fill-color'))
            return
          }
          if (isBorders) {
            setOpenPopoverId((current) => (current === 'borders' ? null : 'borders'))
            return
          }
          if (isValueFormat) {
            setOpenPopoverId((current) => (current === 'value-format' ? null : 'value-format'))
            return
          }
          onAction?.({ id: actionId as CommandToolbarActionId })
        }}
      >
        {isFillColor ? (
          <FillColorIcon fillColor={state?.fillColor} />
        ) : item.icon ? (
          <span aria-hidden>{item.icon}</span>
        ) : null}
        {value ? <span>{value}</span> : null}
        {item.kind === 'select' || isFillColor || isBorders || isValueFormat ? (
          <span aria-hidden className="inline-flex text-slate-500">
            <ChevronDown aria-hidden className={TOOLBAR_ICON_SM_CLASS} strokeWidth={1.75} />
          </span>
        ) : null}
      </Button>
    </span>
  )
}

export function NovaSheetToolbar(props: NovaSheetToolbarProps): JSX.Element {
  const {
    ariaLabel = 'NovaSheet toolbar',
    className,
    state,
    disabledActionIds = [],
    onAction,
    onMenuSearchChange,
    items = defaultToolbarItems,
    extensionItems = [],
  } = props
  const disabled = new Set<ToolbarActionId>(disabledActionIds)
  const [openPopoverId, setOpenPopoverId] = useState<ToolbarPopoverId | null>(null)
  const extensionContext: ToolbarRenderContext = {
    state,
    disabledActionIds: disabled,
    closePopover: () => setOpenPopoverId(null),
  }
  const fillAnchorRef = useRef<HTMLSpanElement>(null)
  const bordersAnchorRef = useRef<HTMLSpanElement>(null)
  const mergeAnchorRef = useRef<HTMLSpanElement>(null)
  const valueFormatAnchorRef = useRef<HTMLSpanElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const activeAnchorRef =
    openPopoverId === 'fill-color'
      ? fillAnchorRef
      : openPopoverId === 'borders'
        ? bordersAnchorRef
        : openPopoverId === 'merge-cells'
          ? mergeAnchorRef
          : openPopoverId === 'value-format'
            ? valueFormatAnchorRef
            : { current: null }
  const popoverPosition = useFixedAnchorPosition(activeAnchorRef, openPopoverId !== null)

  useEffect(() => {
    if (!openPopoverId) return

    const onMouseUp = (event: MouseEvent): void => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (fillAnchorRef.current?.contains(target)) return
      if (bordersAnchorRef.current?.contains(target)) return
      if (mergeAnchorRef.current?.contains(target)) return
      if (valueFormatAnchorRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      setOpenPopoverId(null)
    }

    const timerId = window.setTimeout(() => {
      document.addEventListener('mouseup', onMouseUp)
    }, 0)

    return () => {
      window.clearTimeout(timerId)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [openPopoverId])

  return (
    <div
      role="toolbar"
      aria-label={ariaLabel}
      className={cn(
        'relative z-20 overflow-visible border-b border-slate-300 bg-slate-100 text-[13px] text-slate-700',
        className,
      )}
    >
      <div className="flex h-11 items-center gap-0.5 overflow-x-auto whitespace-nowrap px-2.5 py-1">
        {items.map((item) => (
          <Fragment key={item.id}>
            {item.separatorBefore ? (
              <span aria-hidden className="mx-1.5 h-6 w-px flex-none bg-slate-300" />
            ) : null}
            <ToolbarItemControl
              item={item}
              state={state}
              disabled={disabled}
              onAction={onAction}
              onMenuSearchChange={onMenuSearchChange}
              openPopoverId={openPopoverId}
              setOpenPopoverId={setOpenPopoverId}
              popoverAnchorRef={
                item.id === 'fill-color'
                  ? fillAnchorRef
                  : item.id === 'borders'
                    ? bordersAnchorRef
                    : item.id === 'merge-cells'
                      ? mergeAnchorRef
                      : item.id === 'value-format'
                        ? valueFormatAnchorRef
                        : undefined
              }
            />
          </Fragment>
        ))}
        {extensionItems.map((item) => (
          <Fragment key={item.id}>
            {item.separatorBefore ? (
              <span aria-hidden className="mx-1.5 h-6 w-px flex-none bg-slate-300" />
            ) : null}
            <span data-toolbar-extension-id={item.id} className="inline-flex flex-none">
              {item.render(extensionContext)}
            </span>
          </Fragment>
        ))}
      </div>

      {openPopoverId === 'fill-color' && popoverPosition && typeof document !== 'undefined'
        ? createPortal(
            <FillColorPalette
              position={popoverPosition}
              paletteRef={popoverRef}
              selectedColor={state?.fillColor}
              onAction={onAction}
              onClose={() => setOpenPopoverId(null)}
            />,
            document.body,
          )
        : null}

      {openPopoverId === 'borders' && popoverPosition && typeof document !== 'undefined'
        ? createPortal(
            <BorderPalette
              position={popoverPosition}
              paletteRef={popoverRef}
              borderStyle={state?.borderStyle}
              lastBorderPreset={state?.lastBorderPreset}
              onApply={(preset, border) => onAction?.({ id: 'borders', preset, border })}
              onClose={() => setOpenPopoverId(null)}
            />,
            document.body,
          )
        : null}

      {openPopoverId === 'merge-cells' && popoverPosition && typeof document !== 'undefined'
        ? createPortal(
            <MergeMenu
              position={popoverPosition}
              menuRef={popoverRef}
              onSelect={(mode) => {
                if (mode === 'unmerge') {
                  onAction?.({ id: 'unmerge-cells' })
                  return
                }
                onAction?.({ id: 'merge-cells', mode })
              }}
              onClose={() => setOpenPopoverId(null)}
            />,
            document.body,
          )
        : null}

      {openPopoverId === 'value-format' && popoverPosition && typeof document !== 'undefined'
        ? createPortal(
            <ValueFormatMenu
              position={popoverPosition}
              menuRef={popoverRef}
              onSelect={(format) => onAction?.({ id: 'value-format', format })}
              onClose={() => setOpenPopoverId(null)}
            />,
            document.body,
          )
        : null}
    </div>
  )
}
