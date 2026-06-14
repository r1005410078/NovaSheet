import { isSelectionFullyStyled } from './FloatingFormatToolbar'
import type { TextRunAttrs } from './types'

export type RichTextInlineStyle = 'bold' | 'italic' | 'underline' | 'strikethrough'

export interface RichTextEditingSession {
  readonly active: boolean
  saveSelection(): void
  restoreSelection(): boolean
  toggleInlineStyle(kind: RichTextInlineStyle): void
  setColor(color: string): void
  setFontSize(size: number): void
  setFontFamily(fontFamily: string): void
  getActiveAttrs(): TextRunAttrs
}

type MutableTextRunAttrs = {
  -readonly [K in keyof TextRunAttrs]?: TextRunAttrs[K]
}

export function createRichTextEditingSession(editable: HTMLElement): RichTextEditingSession {
  let savedRange: Range | null = null

  const isRangeInsideEditor = (range: Range): boolean =>
    editable.contains(range.commonAncestorContainer)

  const restoreSelection = (): boolean => {
    if (savedRange === null) return false
    if (!isRangeInsideEditor(savedRange)) return false

    const sel = window.getSelection()
    if (sel === null) return false

    sel.removeAllRanges()
    sel.addRange(savedRange)
    return true
  }

  const getEditableRange = (): Range | null => {
    const sel = window.getSelection()
    if (sel === null || sel.rangeCount === 0) return null

    const range = sel.getRangeAt(0)
    if (range.collapsed) return null
    if (!isRangeInsideEditor(range)) return null

    return range
  }

  const wrapSelection = (apply: (span: HTMLSpanElement) => void): void => {
    restoreSelection()

    const range = getEditableRange()
    if (range === null) return

    const span = document.createElement('span')
    apply(span)
    span.appendChild(range.extractContents())
    range.insertNode(span)

    const nextRange = document.createRange()
    nextRange.selectNodeContents(span)
    savedRange = nextRange.cloneRange()

    const sel = window.getSelection()
    if (sel !== null) {
      sel.removeAllRanges()
      sel.addRange(nextRange)
    }
  }

  const toggleInlineStyle = (kind: RichTextInlineStyle): void => {
    restoreSelection()

    const range = getEditableRange()
    if (range === null) return

    switch (kind) {
      case 'bold': {
        const off = isSelectionFullyStyled(range, (el) => el.style.fontWeight === 'bold')
        wrapSelection((span) => { span.style.fontWeight = off ? 'normal' : 'bold' })
        break
      }
      case 'italic': {
        const off = isSelectionFullyStyled(range, (el) => el.style.fontStyle === 'italic')
        wrapSelection((span) => { span.style.fontStyle = off ? 'normal' : 'italic' })
        break
      }
      case 'underline': {
        const off = isSelectionFullyStyled(range, (el) => el.style.textDecoration === 'underline')
        wrapSelection((span) => { span.style.textDecoration = off ? 'none' : 'underline' })
        break
      }
      case 'strikethrough': {
        const off = isSelectionFullyStyled(range, (el) => el.style.textDecoration === 'line-through')
        wrapSelection((span) => { span.style.textDecoration = off ? 'none' : 'line-through' })
        break
      }
    }
  }

  return {
    active: true,
    saveSelection: () => {
      const range = getEditableRange()
      if (range === null) return
      savedRange = range.cloneRange()
    },
    restoreSelection,
    toggleInlineStyle,
    setColor: (color) => wrapSelection((span) => { span.style.color = color }),
    setFontSize: (size) => wrapSelection((span) => { span.style.fontSize = `${size}px` }),
    setFontFamily: (fontFamily) => wrapSelection((span) => { span.style.fontFamily = fontFamily }),
    getActiveAttrs: () => getActiveAttrsFromSelection(editable),
  }
}

export function getActiveAttrsFromSelection(editable: HTMLElement): TextRunAttrs {
  const sel = window.getSelection()
  const node = sel?.anchorNode ?? null
  if (node === null || !editable.contains(node)) return {}

  const attrs: MutableTextRunAttrs = {}
  let current: Node | null = node.nodeType === Node.TEXT_NODE ? node.parentNode : node

  while (current !== null) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const style = (current as HTMLElement).style

      if (attrs.bold === undefined && style.fontWeight === 'bold') attrs.bold = true
      if (attrs.italic === undefined && style.fontStyle === 'italic') attrs.italic = true
      if (attrs.underline === undefined && hasTextDecoration(style, 'underline')) {
        attrs.underline = true
      }
      if (attrs.strikethrough === undefined && hasTextDecoration(style, 'line-through')) {
        attrs.strikethrough = true
      }
      if (attrs.color === undefined && style.color !== '') attrs.color = style.color
      if (attrs.fontSize === undefined && style.fontSize !== '') {
        const fontSize = Number.parseFloat(style.fontSize)
        if (!Number.isNaN(fontSize)) attrs.fontSize = fontSize
      }
      if (attrs.fontFamily === undefined && style.fontFamily !== '') {
        attrs.fontFamily = style.fontFamily
      }
    }

    if (current === editable) break
    current = current.parentNode
  }

  return attrs
}

function hasTextDecoration(style: CSSStyleDeclaration, value: string): boolean {
  return style.textDecoration.includes(value) || style.textDecorationLine.includes(value)
}
