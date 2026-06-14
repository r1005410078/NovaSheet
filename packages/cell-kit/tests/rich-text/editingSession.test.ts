import { describe, expect, it } from 'bun:test'
import {
  createRichTextEditingSession,
  getActiveAttrsFromSelection,
} from '../../src/rich-text/editingSession'

function selectText(root: HTMLElement, start: number, end: number): void {
  const startPoint = findTextPoint(root, start)
  const endPoint = findTextPoint(root, end)
  const range = document.createRange()
  range.setStart(startPoint.node, startPoint.offset)
  range.setEnd(endPoint.node, endPoint.offset)
  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
}

function findTextPoint(root: HTMLElement, offset: number): { node: Text; offset: number } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let consumed = 0
  let node: Node | null = walker.nextNode()
  while (node !== null) {
    const text = node as Text
    const next = consumed + text.data.length
    if (offset <= next) {
      return { node: text, offset: offset - consumed }
    }
    consumed = next
    node = walker.nextNode()
  }
  throw new Error(`Text offset ${offset} is outside root text content`)
}

describe('rich-text editing session', () => {
  it('saves and restores a non-collapsed selection inside the editor', () => {
    const editable = document.createElement('div')
    editable.innerHTML = '<span>abcd</span>'
    document.body.appendChild(editable)
    selectText(editable, 1, 3)

    const session = createRichTextEditingSession(editable)
    session.saveSelection()
    window.getSelection()!.removeAllRanges()

    expect(session.restoreSelection()).toBe(true)
    expect(window.getSelection()!.toString()).toBe('bc')
  })

  it('toggleInlineStyle wraps restored selection in bold span', () => {
    const editable = document.createElement('div')
    editable.innerHTML = '<span>abcd</span>'
    document.body.appendChild(editable)
    selectText(editable, 1, 3)

    const session = createRichTextEditingSession(editable)
    session.saveSelection()
    window.getSelection()!.removeAllRanges()
    session.toggleInlineStyle('bold')

    expect(editable.textContent).toBe('abcd')
    expect(editable.innerHTML).toContain('font-weight')
  })

  it('setFontSize and setFontFamily apply explicit inline styles', () => {
    const editable = document.createElement('div')
    editable.innerHTML = '<span>abcd</span>'
    document.body.appendChild(editable)
    selectText(editable, 1, 3)

    const session = createRichTextEditingSession(editable)
    session.saveSelection()
    session.setFontSize(18)
    selectText(editable, 1, 3)
    session.saveSelection()
    session.setFontFamily('Arial')

    expect(editable.innerHTML).toContain('font-size')
    expect(editable.innerHTML).toContain('font-family')
  })

  it('getActiveAttrsFromSelection reads nearest inline attrs', () => {
    const editable = document.createElement('div')
    editable.innerHTML =
      '<span style="font-weight:bold;color:#ff0000;font-size:18px">ab</span>'
    document.body.appendChild(editable)
    selectText(editable, 0, 1)

    expect(getActiveAttrsFromSelection(editable)).toMatchObject({
      bold: true,
      fontSize: 18,
    })
  })
})
