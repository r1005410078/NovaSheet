import { useSyncExternalStore } from 'react'
import type { ToolbarExtensionItem } from '@novasheet/react'
import type { RichTextToolbarController } from './RichTextToolbarProvider'

function commandButton(
  label: string,
  command: string,
  disabled: boolean,
  onClick: () => void,
): JSX.Element {
  return (
    <button
      type="button"
      data-rich-text-command={command}
      disabled={disabled}
      title={label}
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
  const session = useSyncExternalStore(
    controller.subscribe,
    controller.getSession,
    controller.getSession,
  )
  const disabled = !session

  return (
    <span data-rich-text-toolbar="" role="group" aria-label="富文本">
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
    </span>
  )
}
