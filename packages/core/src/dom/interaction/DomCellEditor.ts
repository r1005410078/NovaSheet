/**
 * Phase 3.5 — DOM 单元格编辑器（覆盖在 active cell 上）。
 *
 * 内部维护两个元素：`<input>` 给 number 等单行字段；`<textarea>` 给任意非 number 字段
 * （`open({ multiline })` 决定本次会话用哪一个，另一个隐藏）。
 * 多行模式（对齐 Google 表格）：Enter 提交，Alt+Enter 插入硬换行 `\n`；编辑框不软折——
 * 默认 1 行、长单行横向溢出、纵向仅随 `\n` 由 `autoGrow` 增长，网格行高在提交时才 autofit。
 */

import type { CellRect } from '../../kernel/interaction/CellLayout'
import type { Theme } from '../../kernel/theme/Theme'
import { applyCellEditorTheme, ensureCellEditorStylesheet } from '../host/cell-editor-style'

export interface DomCellEditorCallbacks {
  onDraftChange: (draft: string) => void
  /** Enter 提交后是否下移 active cell */
  onCommitEnter: () => void
  onCommitBlur: () => void
  onCancel: () => void
}

type EditorEl = HTMLInputElement | HTMLTextAreaElement

/** 横向自增长时在最长行末尾留的缓冲，使光标/文字接近边缘前就加宽、不贴边。 */
const WIDTH_GROW_BUFFER_PX = 8

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
  /** 当前单元格矩形；自增长时作为 textarea 的最小高度。 */
  private cellRect: CellRect | null = null

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
    this.textarea.rows = 1 // 默认 1 行（覆盖 textarea 原生 rows=2，否则 scrollHeight 起步即 2 行）
    this.textarea.wrap = 'off' // 不软折：长单行横向加宽，纵向仅随 \n 增长（对齐 Google 表格）
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
    this.autoGrow()
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
    this.cellRect = rect
    Object.assign(this.active.style, {
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    })
    // textarea 在滚动重定位后恢复随内容自增长的高度；单行 input 维持单元格高。
    this.autoGrow()
  }

  /**
   * 让 textarea 随内容增长（盖住相邻单元格，不改网格）：
   * - 高度按 `\n` 行数向下增长（下限为单元格高）；
   * - 宽度按最长行向右增长（下限为单元格宽，留一点缓冲使文字不贴边，无横向滚动条）。
   * `border-box` 下补回边框，避免残留滚动条。先把尺寸缩回单元格再测，让 scroll* 反映真实内容。
   */
  private autoGrow(): void {
    const el = this.active
    if (!(el instanceof HTMLTextAreaElement) || !this.cellRect) return
    el.style.height = `${this.cellRect.height}px`
    const borderY = el.offsetHeight - el.clientHeight
    el.style.height = `${Math.max(this.cellRect.height, el.scrollHeight + borderY)}px`
    el.style.width = `${this.cellRect.width}px`
    const borderX = el.offsetWidth - el.clientWidth
    const contentWidth = el.scrollWidth + borderX + WIDTH_GROW_BUFFER_PX
    el.style.width = `${Math.max(this.cellRect.width, contentWidth)}px`
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
    this.autoGrow()
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
    this.autoGrow()
  }
}
