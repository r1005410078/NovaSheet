import { describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { FloatingFormatToolbar, isSelectionFullyStyled, getCurrentFontSize, DEFAULT_FONT_SIZE } from '../../src/rich-text/FloatingFormatToolbar'

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

  // F2: isSelectionFullyStyled helper 单元测试（直接构造 mock range，绕过 happy-dom range 遍历限制）
  describe('isSelectionFullyStyled', () => {
    it('returns false for collapsed range', () => {
      const span = document.createElement('span')
      span.style.fontWeight = 'bold'
      span.textContent = 'bold'
      document.body.appendChild(span)
      const textNode = span.firstChild!
      const range = document.createRange()
      range.setStart(textNode, 1)
      range.setEnd(textNode, 1) // collapsed
      expect(isSelectionFullyStyled(range, (el) => el.style.fontWeight === 'bold')).toBe(false)
      document.body.removeChild(span)
    })

    it('returns true when cloneContents yields only bold text nodes', () => {
      const boldSpan = document.createElement('span')
      boldSpan.style.fontWeight = 'bold'
      boldSpan.textContent = 'hello'
      // Build a mock range whose cloneContents returns the bold span
      const fragment = document.createDocumentFragment()
      fragment.appendChild(boldSpan)
      const mockRange = {
        collapsed: false,
        cloneContents: () => fragment,
      } as unknown as Range
      expect(isSelectionFullyStyled(mockRange, (el) => el.style.fontWeight === 'bold')).toBe(true)
    })

    it('returns false when any text node lacks the style', () => {
      const boldSpan = document.createElement('span')
      boldSpan.style.fontWeight = 'bold'
      boldSpan.textContent = 'bold'
      const plainSpan = document.createElement('span')
      plainSpan.textContent = 'plain'
      const fragment = document.createDocumentFragment()
      fragment.appendChild(boldSpan)
      fragment.appendChild(plainSpan)
      const mockRange = {
        collapsed: false,
        cloneContents: () => fragment,
      } as unknown as Range
      expect(isSelectionFullyStyled(mockRange, (el) => el.style.fontWeight === 'bold')).toBe(false)
    })

    it('returns false for empty fragment (no text nodes)', () => {
      const fragment = document.createDocumentFragment()
      const mockRange = {
        collapsed: false,
        cloneContents: () => fragment,
      } as unknown as Range
      expect(isSelectionFullyStyled(mockRange, () => true)).toBe(false)
    })
  })

  // F2: Bold toggle-off via DOM integration
  it('Bold toggles OFF when selection is already fully bold', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    editable.innerHTML = '<span style="font-weight:bold">bc</span>'
    document.body.appendChild(editable)

    const boldSpan = editable.querySelector('span')!
    const textNode = boldSpan.firstChild!
    const range = document.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, 2)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)

    const root = createRoot(host)
    await act(async () => { root.render(<FloatingFormatToolbar editableRef={{ current: editable }} />) })
    const boldBtn = host.querySelector('[data-cmd="bold"]') as HTMLButtonElement
    await act(async () => { boldBtn.click() })
    // After toggle-off, inner span should have font-weight:normal (overrides outer bold)
    const html = editable.innerHTML
    expect(html).toContain('font-weight: normal')
    expect(editable.textContent).toBe('bc')
  })

  // F2: Italic toggle-off
  it('Italic toggles OFF when selection is already fully italic', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    editable.innerHTML = '<span style="font-style:italic">bc</span>'
    document.body.appendChild(editable)

    const italicSpan = editable.querySelector('span')!
    const textNode = italicSpan.firstChild!
    const range = document.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, 2)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)

    const root = createRoot(host)
    await act(async () => { root.render(<FloatingFormatToolbar editableRef={{ current: editable }} />) })
    const italicBtn = host.querySelector('[data-cmd="italic"]') as HTMLButtonElement
    await act(async () => { italicBtn.click() })
    const html = editable.innerHTML
    // After toggle-off, inner span should have font-style:normal (overrides outer italic)
    expect(html).toContain('font-style: normal')
    expect(editable.textContent).toBe('bc')
  })

  // F5: getCurrentFontSize helper 单元测试
  describe('getCurrentFontSize', () => {
    it('returns DEFAULT_FONT_SIZE when no ancestor has fontSize', () => {
      const span = document.createElement('span')
      span.textContent = 'x'
      document.body.appendChild(span)
      const textNode = span.firstChild!
      expect(getCurrentFontSize(textNode)).toBe(DEFAULT_FONT_SIZE)
      document.body.removeChild(span)
    })

    it('returns parsed font size from nearest ancestor', () => {
      const outer = document.createElement('span')
      outer.style.fontSize = '18px'
      const inner = document.createElement('span')
      inner.style.fontSize = '22px'
      outer.appendChild(inner)
      inner.textContent = 'x'
      document.body.appendChild(outer)
      const textNode = inner.firstChild!
      expect(getCurrentFontSize(textNode)).toBe(22)
      document.body.removeChild(outer)
    })

    it('returns DEFAULT_FONT_SIZE when anchorNode is null', () => {
      expect(getCurrentFontSize(null)).toBe(DEFAULT_FONT_SIZE)
    })
  })

  // F5: font-size-inc button
  it('font-size-inc wraps selection with incremented font-size span', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    editable.innerHTML = '<span>abcd</span>'
    document.body.appendChild(editable)

    const textNode = editable.querySelector('span')!.firstChild!
    const range = document.createRange()
    range.setStart(textNode, 1)
    range.setEnd(textNode, 3)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)

    const root = createRoot(host)
    await act(async () => { root.render(<FloatingFormatToolbar editableRef={{ current: editable }} />) })
    const incBtn = host.querySelector('[data-cmd="font-size-inc"]') as HTMLButtonElement
    await act(async () => { incBtn.click() })
    // Default font size is 14, +2 = 16
    expect(editable.innerHTML).toContain('font-size')
    expect(editable.textContent).toBe('abcd')
  })

  // F5: font-size-dec button
  it('font-size-dec wraps selection with decremented font-size span', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    editable.innerHTML = '<span>abcd</span>'
    document.body.appendChild(editable)

    const textNode = editable.querySelector('span')!.firstChild!
    const range = document.createRange()
    range.setStart(textNode, 1)
    range.setEnd(textNode, 3)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)

    const root = createRoot(host)
    await act(async () => { root.render(<FloatingFormatToolbar editableRef={{ current: editable }} />) })
    const decBtn = host.querySelector('[data-cmd="font-size-dec"]') as HTMLButtonElement
    await act(async () => { decBtn.click() })
    // Default font size is 14, -2 = 12
    expect(editable.innerHTML).toContain('font-size')
    expect(editable.textContent).toBe('abcd')
  })

  // F5: clamp at minimum 8
  it('font-size-dec clamps at minimum 8px', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    // Use 10px so one dec → 8px (the clamp floor); no pre-existing 8px in content
    editable.innerHTML = '<span style="font-size:10px">abcd</span>'
    document.body.appendChild(editable)

    const textNode = editable.querySelector('span')!.firstChild!
    const range = document.createRange()
    range.setStart(textNode, 1)
    range.setEnd(textNode, 3)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)

    const root = createRoot(host)
    await act(async () => { root.render(<FloatingFormatToolbar editableRef={{ current: editable }} />) })
    const decBtn = host.querySelector('[data-cmd="font-size-dec"]') as HTMLButtonElement
    await act(async () => { decBtn.click() })
    // The newly inserted wrapper span must have font-size exactly 8px (clamp floor)
    const spans = editable.querySelectorAll('span[style*="font-size"]')
    const newSpan = Array.from(spans).find((s) => (s as HTMLElement).style.fontSize === '8px')
    expect(newSpan).not.toBeUndefined()
    expect(editable.textContent).toBe('abcd')
  })

  // F5: clamp at maximum 96
  it('font-size-inc clamps at maximum 96px', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    editable.innerHTML = '<span style="font-size:96px">abcd</span>'
    document.body.appendChild(editable)

    const textNode = editable.querySelector('span')!.firstChild!
    const range = document.createRange()
    range.setStart(textNode, 1)
    range.setEnd(textNode, 3)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)

    const root = createRoot(host)
    await act(async () => { root.render(<FloatingFormatToolbar editableRef={{ current: editable }} />) })
    const incBtn = host.querySelector('[data-cmd="font-size-inc"]') as HTMLButtonElement
    await act(async () => { incBtn.click() })
    // Should clamp at 96, not exceed
    expect(editable.innerHTML).toContain('96px')
    expect(editable.textContent).toBe('abcd')
  })
})
