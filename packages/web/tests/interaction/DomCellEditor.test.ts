import { describe, expect, it, mock } from 'bun:test'
import { DomCellEditor } from '../../src/interaction/DomCellEditor'

describe('DomCellEditor — Phase 3.5', () => {
  it('open 后 focus input，Esc 触发 onCancel', () => {
    const container = document.createElement('div')
    Object.assign(container.style, { position: 'relative', width: '200px', height: '100px' })
    document.body.appendChild(container)

    const onCancel = mock(() => {})
    const editor = new DomCellEditor(container, {
      onDraftChange: mock(() => {}),
      onCommitEnter: mock(() => {}),
      onCommitBlur: mock(() => {}),
      onCancel,
    })
    editor.attach()
    editor.open({ x: 10, y: 20, width: 80, height: 28 }, 'hello')

    const input = container.querySelector('input[data-novasheet-cell-editor]') as HTMLInputElement
    expect(input.value).toBe('hello')
    expect(document.activeElement).toBe(input)

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onCancel).toHaveBeenCalled()

    editor.destroy()
    document.body.removeChild(container)
  })

  it('multiline=true 时切换到 textarea；Alt+Enter 插入软换行', () => {
    const container = document.createElement('div')
    Object.assign(container.style, { position: 'relative', width: '200px', height: '100px' })
    document.body.appendChild(container)

    const onDraftChange = mock((_draft: string) => {})
    const onCommitEnter = mock(() => {})
    const editor = new DomCellEditor(container, {
      onDraftChange,
      onCommitEnter,
      onCommitBlur: mock(() => {}),
      onCancel: mock(() => {}),
    })
    editor.attach()
    editor.open({ x: 0, y: 0, width: 200, height: 60 }, 'line1', { multiline: true })

    const textarea = container.querySelector(
      'textarea[data-novasheet-cell-editor]',
    ) as HTMLTextAreaElement
    const input = container.querySelector('input[data-novasheet-cell-editor]') as HTMLInputElement
    expect(textarea.style.display).toBe('block')
    expect(input.style.display).toBe('none')
    expect(textarea.value).toBe('line1')
    expect(document.activeElement).toBe(textarea)

    textarea.setSelectionRange(textarea.value.length, textarea.value.length)
    textarea.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', altKey: true, bubbles: true }),
    )
    expect(textarea.value).toBe('line1\n')
    expect(onCommitEnter).not.toHaveBeenCalled()
    expect(onDraftChange).toHaveBeenCalledWith('line1\n')

    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onCommitEnter).toHaveBeenCalledTimes(1)

    editor.destroy()
    document.body.removeChild(container)
  })
})
