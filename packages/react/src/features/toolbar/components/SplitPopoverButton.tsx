import type { ReactNode, Ref } from 'react'

import { Button } from '@/components/button'
import { TOOLBAR_ICON_SM_CLASS } from '../lib/icon-class'
import { ChevronDown } from 'lucide-react'

export function SplitPopoverButton({
  anchorRef,
  actionId,
  controlId,
  label,
  disabled,
  isOpen,
  onPrimary,
  onToggleMenu,
  children,
}: {
  readonly anchorRef?: Ref<HTMLSpanElement>
  readonly actionId: string
  readonly controlId: string
  readonly label: string
  readonly disabled: boolean
  readonly isOpen: boolean
  readonly onPrimary: () => void
  readonly onToggleMenu: () => void
  readonly children: ReactNode
}): JSX.Element {
  return (
    <span ref={anchorRef} className="inline-flex flex-none items-stretch gap-0">
      <Button
        aria-label={label}
        data-action-id={actionId}
        data-action-part="primary"
        data-control-id={controlId}
        disabled={disabled}
        title={label}
        className="min-w-7 gap-0 rounded-r-none pl-1 pr-0.5"
        onClick={() => {
          if (disabled) return
          onPrimary()
        }}
      >
        {children}
      </Button>
      <Button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={`${label} 菜单`}
        data-action-id={actionId}
        data-action-part="menu"
        data-control-id={controlId}
        disabled={disabled}
        title={`${label} 菜单`}
        className="min-w-0 gap-0 rounded-l-none px-0 pl-0 pr-0.5"
        onClick={() => {
          if (disabled) return
          onToggleMenu()
        }}
      >
        <span aria-hidden className="inline-flex text-[#5f6368]">
          <ChevronDown aria-hidden className={TOOLBAR_ICON_SM_CLASS} strokeWidth={1.75} />
        </span>
      </Button>
    </span>
  )
}
