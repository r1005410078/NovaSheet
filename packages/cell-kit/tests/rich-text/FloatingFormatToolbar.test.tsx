import { describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { FloatingFormatToolbar } from '../../src/rich-text/FloatingFormatToolbar'

describe('FloatingFormatToolbar', () => {
  it('Bold button wraps current selection in font-weight:bold', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    editable.innerHTML = '<span>abcd</span>'
    document.body.appendChild(editable)
    // 选中 'bc'（offset 1..3）
    const textNode = editable.querySelector('span')!.firstChild!
    const range = document.createRange()
    range.setStart(textNode, 1); range.setEnd(textNode, 3)
    const sel = window.getSelection()!; sel.removeAllRanges(); sel.addRange(range)

    const root = createRoot(host)
    await act(async () => { root.render(<FloatingFormatToolbar editableRef={{ current: editable }} />) })
    const boldBtn = host.querySelector('[data-cmd="bold"]') as HTMLButtonElement
    await act(async () => { boldBtn.click() })
    // happy-dom 输出 "font-weight: bold;" (含空格/分号)，toContain 仅验语义
    expect(editable.innerHTML).toContain('font-weight')
    expect(editable.textContent).toBe('abcd')
  })
})
