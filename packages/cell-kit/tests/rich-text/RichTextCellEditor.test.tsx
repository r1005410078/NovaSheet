import { describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { RichTextToolbarProvider, useRichTextToolbarController } from '../../src/rich-text/RichTextToolbarProvider'
import { createRichTextEditor, richTextEditor } from '../../src/rich-text/RichTextCellEditor'
import type { CellEditorOpenContext } from '@novasheet/core'
import type { RichTextToolbarController } from '../../src/rich-text/RichTextToolbarProvider'

function open(over: Partial<CellEditorOpenContext> = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const committed: { value: unknown; runs: unknown } = { value: undefined, runs: undefined }
  const ctx: CellEditorOpenContext = {
    cell: { rowIndex: 0, colIndex: 0 },
    field: { id: 't', name: 'T', type: 'text', width: 120 },
    value: 'abcd',
    container,
    rect: { x: 0, y: 0, width: 120, height: 24 },
    trigger: 'double-click',
    commit: (v) => { committed.value = v },
    setAttachment: (_ns, data) => { committed.runs = data; return true },
    cancel: () => {},
    ...over,
  }
  return { ctx, container, committed }
}

describe('richTextEditor', () => {
  it('renders contenteditable seeded with current value', async () => {
    const { ctx, container } = open()
    await act(async () => { richTextEditor.open(ctx) })
    const ce = container.querySelector('[contenteditable]') as HTMLElement
    expect(ce).toBeTruthy()
    expect(ce.textContent).toBe('abcd')
  })

  it('matches the grid cell editor typography and spacing variables', async () => {
    const { ctx, container } = open()
    await act(async () => { richTextEditor.open(ctx) })
    const ce = container.querySelector('[contenteditable]') as HTMLElement

    expect(ce.style.fontFamily).toBe('var(--ns-cell-editor-font)')
    expect(ce.style.fontSize).toBe('var(--ns-cell-editor-font-size)')
    expect(ce.style.lineHeight).toBe('1.2')
    expect(ce.style.padding).toBe(
      'var(--ns-cell-editor-padding-y) var(--ns-cell-editor-padding-x)',
    )
    expect(ce.style.boxSizing).toBe('border-box')
  })

  it('commit serializes DOM → value + runs (bold substring preserved)', async () => {
    const { ctx, container, committed } = open()
    await act(async () => { richTextEditor.open(ctx) })
    const ce = container.querySelector('[contenteditable]') as HTMLElement
    // 模拟用户把 'bc' 加粗：直接设 DOM（toolbar 行为在 Task 6 测）
    ce.innerHTML = '<span>a</span><span style="font-weight:bold">bc</span><span>d</span>'
    // 触发提交（组件暴露的提交入口——blur）
    // happy-dom: React onBlur maps to focusout internally
    await act(async () => { ce.dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })
    expect(committed.value).toBe('abcd')
    expect(committed.runs).toEqual([{ start: 1, end: 3, attrs: { bold: true } }])
  })

  it('does not commit when focus moves into external rich-text color picker', async () => {
    const { ctx, container, committed } = open()
    await act(async () => { richTextEditor.open(ctx) })
    const ce = container.querySelector('[contenteditable]') as HTMLElement
    const picker = document.createElement('div')
    picker.setAttribute('data-rich-text-color-picker', '')
    const input = document.createElement('input')
    picker.appendChild(input)
    document.body.appendChild(picker)

    await act(async () => {
      ce.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: input }))
    })

    expect(committed.value).toBeUndefined()
    expect(committed.runs).toBeUndefined()
    picker.remove()
  })

  it('seeds contenteditable with existing runs when getAttachment is provided', async () => {
    const existingRuns = [{ start: 1, end: 3, attrs: { bold: true } }]
    const { ctx, container } = open({
      value: 'abcd',
      getAttachment: (ns) => (ns === 'richText' ? existingRuns : undefined),
    })
    await act(async () => { richTextEditor.open(ctx) })
    const ce = container.querySelector('[contenteditable]') as HTMLElement
    expect(ce).toBeTruthy()
    // 'bc' (start=1, end=3) should be wrapped in a bold span
    const boldSpan = ce.querySelector('span[style*="font-weight"]') ?? ce.querySelector('span[style*="bold"]')
    expect(boldSpan).toBeTruthy()
    expect(boldSpan!.textContent).toBe('bc')
  })

  it('default richTextEditor does not render inline floating toolbar', async () => {
    const { ctx, container } = open()
    await act(async () => { richTextEditor.open(ctx) })
    expect(container.querySelector('[data-novasheet-rich-text-editor]')).toBeTruthy()
    expect(container.querySelector('[data-novasheet-format-toolbar]')).toBeNull()
  })

  it('createRichTextEditor can opt into inline toolbar for legacy demos', async () => {
    const { ctx, container } = open()
    const editor = createRichTextEditor({ showInlineToolbar: true })
    await act(async () => { editor.open(ctx) })
    expect(container.querySelector('[data-cmd="bold"]')).toBeTruthy()
  })

  it('registers active session with RichTextToolbarProvider while mounted', async () => {
    let controller: RichTextToolbarController | undefined
    const getController = (): RichTextToolbarController => {
      if (controller === undefined) throw new Error('expected RichTextToolbarProvider controller')
      return controller
    }

    function Capture(): JSX.Element {
      controller = useRichTextToolbarController()
      return <div />
    }

    const providerHost = document.createElement('div')
    document.body.appendChild(providerHost)
    const root = createRoot(providerHost)
    await act(async () => {
      root.render(
        <RichTextToolbarProvider>
          <Capture />
        </RichTextToolbarProvider>,
      )
    })

    const { ctx, container } = open()
    const editor = createRichTextEditor({ getToolbarController: getController })
    await act(async () => { editor.open(ctx) })

    const session = getController().getSession()
    expect(session).toBeTruthy()
    expect(session?.active).toBe(true)

    await act(async () => { editor.close?.() })
    expect(getController().getSession()).toBeNull()

    await act(async () => { root.unmount() })
    providerHost.remove()
    container.remove()
  })
})
