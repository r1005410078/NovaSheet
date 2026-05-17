/**
 * Phase 3.5 — DOM 单元格编辑器（覆盖在 active cell 上）。
 *
 * 内部维护两个元素：`<input>` 给普通字段；`<textarea>` 给 `field.wrap === true`
 * 字段。`open({ multiline })` 决定本次会话使用哪一个，另一个保持隐藏。
 * 多行模式下：Enter 提交（沿用 Sheets 约定），Alt+Enter 插入软换行。
 */

import type { CellRect, Theme } from '@novasheet/core'
import { applyCellEditorTheme, ensureCellEditorStylesheet } from '../host/cell-editor-style'

export interface DomCellEditorCallbacks {
  onDraftChange: (draft: string) => void
  /** Enter 提交后是否下移 active cell */
  onCommitEnter: () => void
  onCommitBlur: () => void
  onCancel: () => void
}

type EditorEl = HTMLInputElement | HTMLTextAreaElement

export interface OpenCellEditorOptions {
  selectAll?: boolean
  multiline?: boolean
}

export class DomCellEditor {
  private container: HTMLElement
  private callbacks: DomCellEditorCallbacks
  private input!: HTMLInputElement
  private textarea!: HTMLTextAreaElement
  private active: EditorEl | null = null
  private attached = false
  private destroyed = false

  constructor(container: HTMLElement, callbacks: DomCellEditorCallbacks) {
    this.container = container
    this.callbacks = callbacks
  }

  attach(): void {
    if (this.attached || this.destroyed) return
    this.attached = true

    this.input = document.createElement('input')
    this.input.type = 'text'
    this.input.autocomplete = 'off'
    this.input.setAttribute('data-novasheet-cell-editor', '')
    this.input.spellcheck = false
    this.input.style.display = 'none'
    this.input.addEventListener('input', this.onInput)
    this.input.addEventListener('keydown', this.onKeyDown)
    this.input.addEventListener('blur', this.onBlur)
    this.container.appendChild(this.input)

    this.textarea = document.createElement('textarea')
    this.textarea.dataset.multiline = ''
    this.textarea.wrap = 'soft'
    this.textarea.setAttribute('data-novasheet-cell-editor', '')
    this.textarea.spellcheck = false
    this.textarea.style.display = 'none'
    this.textarea.addEventListener('input', this.onInput)
    this.textarea.addEventListener('keydown', this.onKeyDown)
    this.textarea.addEventListener('blur', this.onBlur)
    this.container.appendChild(this.textarea)

    ensureCellEditorStylesheet(this.container.ownerDocument)
  }

  applyTheme(theme: Theme): void {
    if (this.destroyed) return
    applyCellEditorTheme(this.container, theme)
  }

  isOpen(): boolean {
    return this.attached && this.active !== null && this.active.style.display !== 'none'
  }

  open(rect: CellRect, draft: string, options: OpenCellEditorOptions = {}): void {
    if (!this.attached) return
    const el: EditorEl = options.multiline ? this.textarea : this.input
    const inactive: EditorEl = el === this.input ? this.textarea : this.input
    inactive.style.display = 'none'

    this.active = el
    this.syncRect(rect)
    el.value = draft
    el.style.display = 'block'
    el.focus()
    if (options.selectAll !== false) {
      el.select()
      return
    }
    const end = el.value.length
    el.setSelectionRange(end, end)
  }

  syncRect(rect: CellRect): void {
    if (!this.active) return
    Object.assign(this.active.style, {
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    })
  }

  close(): void {
    if (!this.active) return
    this.active.style.display = 'none'
    this.active.value = ''
    this.active = null
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.input?.removeEventListener('input', this.onInput)
    this.input?.removeEventListener('keydown', this.onKeyDown)
    this.input?.removeEventListener('blur', this.onBlur)
    if (this.input?.parentNode === this.container) {
      this.container.removeChild(this.input)
    }
    this.textarea?.removeEventListener('input', this.onInput)
    this.textarea?.removeEventListener('keydown', this.onKeyDown)
    this.textarea?.removeEventListener('blur', this.onBlur)
    if (this.textarea?.parentNode === this.container) {
      this.container.removeChild(this.textarea)
    }
    this.attached = false
    this.active = null
  }

  private onInput = (event: Event): void => {
    const el = event.currentTarget as EditorEl
    this.callbacks.onDraftChange(el.value)
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      this.callbacks.onCancel()
      return
    }
    if (event.key === 'Enter') {
      if (this.active instanceof HTMLTextAreaElement && event.altKey) {
        event.preventDefault()
        event.stopPropagation()
        this.insertNewline(this.active)
        return
      }
      event.preventDefault()
      event.stopPropagation()
      this.callbacks.onCommitEnter()
    }
  }

  private onBlur = (): void => {
    if (!this.isOpen()) return
    this.callbacks.onCommitBlur()
  }

  private insertNewline(el: HTMLTextAreaElement): void {
    const { selectionStart, selectionEnd, value } = el
    const start = selectionStart ?? value.length
    const end = selectionEnd ?? start
    el.value = `${value.slice(0, start)}\n${value.slice(end)}`
    el.setSelectionRange(start + 1, start + 1)
    this.callbacks.onDraftChange(el.value)
  }
}
