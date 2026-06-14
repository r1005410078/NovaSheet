import { describe, expect, it } from 'bun:test'
import { act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import {
  RichTextToolbarProvider,
  richTextToolbarExtension,
  useRichTextToolbarController,
} from '../../src/rich-text'
import { createRichTextEditingSession } from '../../src/rich-text/editingSession'

function Harness(): JSX.Element {
  const controller = useRichTextToolbarController()
  const item = richTextToolbarExtension(controller)
  return <>{item.render({ disabledActionIds: new Set(), closePopover: () => undefined })}</>
}

describe('richTextToolbarExtension', () => {
  it('renders disabled controls without active session', async () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => {
      root.render(
        <RichTextToolbarProvider>
          <Harness />
        </RichTextToolbarProvider>,
      )
    })

    const bold = host.querySelector<HTMLButtonElement>('[data-rich-text-command="bold"]')
    expect(bold).not.toBeNull()
    expect(bold!.disabled).toBe(true)
  })

  it('calls active session from external bold button', async () => {
    const editable = document.createElement('div')
    editable.innerHTML = '<span>abcd</span>'
    document.body.appendChild(editable)
    const text = editable.querySelector('span')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 1)
    range.setEnd(text, 3)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)

    function ActiveHarness(): JSX.Element {
      const controller = useRichTextToolbarController()
      const item = richTextToolbarExtension(controller)
      const session = createRichTextEditingSession(editable)
      useEffect(() => {
        controller.setSession(session)
        session.saveSelection()
        return () => controller.setSession(null)
      }, [controller, session])
      return <>{item.render({ disabledActionIds: new Set(), closePopover: () => undefined })}</>
    }

    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => {
      root.render(
        <RichTextToolbarProvider>
          <ActiveHarness />
        </RichTextToolbarProvider>,
      )
    })

    const bold = host.querySelector<HTMLButtonElement>('[data-rich-text-command="bold"]')
    await act(async () => { bold!.click() })

    expect(editable.innerHTML).toContain('font-weight')
  })
})
