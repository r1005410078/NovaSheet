import { describe, expect, it, mock } from 'bun:test'
import { act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import {
  RichTextToolbarProvider,
  richTextToolbarExtension,
  useRichTextToolbarController,
} from '../../src/rich-text'
import { createRichTextEditingSession } from '../../src/rich-text/editingSession'
import type { RichTextEditingSession } from '../../src/rich-text/editingSession'

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

  it('renders rich-text commands as compact toolbar buttons', async () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => {
      root.render(
        <RichTextToolbarProvider>
          <Harness />
        </RichTextToolbarProvider>,
      )
    })

    const group = host.querySelector<HTMLElement>('[data-rich-text-toolbar]')
    const bold = host.querySelector<HTMLButtonElement>('[data-rich-text-command="bold"]')
    const colorIndicator = host.querySelector<HTMLElement>('[data-rich-text-color-indicator]')
    expect(group?.className).toContain('inline-flex')
    expect(group?.className).toContain('gap-0.5')
    expect(bold?.className).toContain('h-7')
    expect(bold?.className).toContain('min-w-7')
    expect(bold?.className).toContain('hover:bg-slate-200')
    expect(colorIndicator).not.toBeNull()
    expect(colorIndicator?.className).toContain('border-b-2')
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

  it('opens text color picker and applies confirmed color to active session', async () => {
    const setColor = mock((_color: string) => {})

    function ActiveHarness(): JSX.Element {
      const controller = useRichTextToolbarController()
      const item = richTextToolbarExtension(controller)
      useEffect(() => {
        const session: RichTextEditingSession = {
          active: true,
          saveSelection: () => undefined,
          restoreSelection: () => true,
          toggleInlineStyle: () => undefined,
          setColor,
          setFontSize: () => undefined,
          setFontFamily: () => undefined,
          getActiveAttrs: () => ({ color: '#000000' }),
        }
        controller.setSession(session)
        return () => controller.setSession(null)
      }, [controller])
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

    const color = host.querySelector<HTMLButtonElement>('[data-rich-text-command="color"]')
    expect(color).not.toBeNull()
    await act(async () => { color!.click() })

    const picker = document.body.querySelector<HTMLElement>('[data-rich-text-color-picker]')
    expect(picker).not.toBeNull()
    const paletteSwatch = picker!.querySelector<HTMLButtonElement>('[data-fill-color="#00ff00"]')
    expect(paletteSwatch).not.toBeNull()
    expect(picker!.querySelector('[data-rich-text-custom-color-section]')).not.toBeNull()

    await act(async () => {
      paletteSwatch!.click()
    })

    expect(setColor).toHaveBeenCalledWith('#00ff00')
    expect(document.body.querySelector('[data-rich-text-color-picker]')).toBeNull()

    await act(async () => { root.unmount() })
    host.remove()
  })

  it('opens the shared custom color picker from the rich-text custom section', async () => {
    function ActiveHarness(): JSX.Element {
      const controller = useRichTextToolbarController()
      const item = richTextToolbarExtension(controller)
      useEffect(() => {
        const session: RichTextEditingSession = {
          active: true,
          saveSelection: () => undefined,
          restoreSelection: () => true,
          toggleInlineStyle: () => undefined,
          setColor: () => undefined,
          setFontSize: () => undefined,
          setFontFamily: () => undefined,
          getActiveAttrs: () => ({ color: '#000000' }),
        }
        controller.setSession(session)
        return () => controller.setSession(null)
      }, [controller])
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

    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-rich-text-command="color"]')!.click()
    })
    const picker = document.body.querySelector<HTMLElement>('[data-rich-text-color-picker]')
    expect(picker).not.toBeNull()

    await act(async () => {
      picker!.querySelector<HTMLButtonElement>('[data-custom-color-add]')!.click()
    })

    expect(picker!.querySelector('[data-novasheet-color-picker]')).not.toBeNull()

    await act(async () => { root.unmount() })
    host.remove()
    document.body.querySelector('[data-rich-text-color-picker]')?.remove()
  })
})
