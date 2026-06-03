import type { Field, FilterOp, Theme } from '@novasheet/core'
import {
  applyFilterPopoverTheme,
  ensureFilterPopoverStylesheet,
} from './filter-popover-style'

export interface FilterPopoverCallbacks {
  onApply: (op: FilterOp | null) => void
  onCancel: () => void
}

export interface FilterPopoverAnchor {
  clientX: number
  clientY: number
}

export interface FilterPopoverOpenOptions {
  field: Field
  op?: FilterOp | null
}

type Draft =
  | { kind: 'text-contains'; value: string; caseSensitive: boolean }
  | { kind: 'number-between'; min: string; max: string }
  | { kind: 'date-between'; start: string; end: string }
  | { kind: 'select-in'; values: string[] }
  | { kind: 'checkbox-equals'; value: boolean }
  | { kind: 'is-not-empty' }

export class FilterPopover {
  private container: HTMLElement
  private callbacks: FilterPopoverCallbacks
  private layer!: HTMLElement
  private popover!: HTMLElement
  private attached = false
  private destroyed = false
  private opened = false
  private field: Field | null = null
  private draft: Draft | null = null

  constructor(container: HTMLElement, callbacks: FilterPopoverCallbacks) {
    this.container = container
    this.callbacks = callbacks
  }

  attach(): void {
    if (this.attached || this.destroyed) return
    const doc = this.container.ownerDocument
    this.layer = doc.createElement('div')
    this.layer.setAttribute('data-novasheet-filter-popover-layer', '')
    this.popover = doc.createElement('div')
    this.popover.setAttribute('data-novasheet-filter-popover', '')
    this.popover.setAttribute('role', 'dialog')
    this.popover.setAttribute('tabindex', '-1')
    this.popover.addEventListener('keydown', this.onKeyDown)
    doc.addEventListener('pointerdown', this.onDocumentPointerDown, true)
    this.layer.appendChild(this.popover)
    doc.body.appendChild(this.layer)
    ensureFilterPopoverStylesheet(doc)
    this.attached = true
  }

  applyTheme(theme: Theme): void {
    if (!this.attached || this.destroyed) return
    applyFilterPopoverTheme(this.layer, theme)
  }

  isOpen(): boolean {
    return this.attached && this.opened
  }

  open(anchor: FilterPopoverAnchor, options: FilterPopoverOpenOptions): void {
    if (!this.attached || this.destroyed) return
    this.field = options.field
    this.draft = toDraft(options.field, options.op ?? null)
    this.render()
    this.popover.style.position = 'fixed'
    this.popover.style.left = `${anchor.clientX}px`
    this.popover.style.top = `${anchor.clientY}px`
    this.popover.setAttribute('data-open', '')
    this.opened = true
    this.updateApplyState()
    this.popover.focus()
  }

  close(): void {
    this.closeInternal(false)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    if (!this.attached) return
    const doc = this.container.ownerDocument
    this.popover.removeEventListener('keydown', this.onKeyDown)
    doc.removeEventListener('pointerdown', this.onDocumentPointerDown, true)
    this.layer.parentNode?.removeChild(this.layer)
    this.attached = false
    this.opened = false
  }

  private render(): void {
    while (this.popover.firstChild) this.popover.removeChild(this.popover.firstChild)
    if (!this.field || !this.draft) return

    const title = document.createElement('div')
    title.setAttribute('data-ns-filter-title', '')
    title.textContent = this.field.name
    this.popover.appendChild(title)

    this.renderDraftControls(this.draft)

    const actions = document.createElement('div')
    const apply = document.createElement('button')
    apply.type = 'button'
    apply.textContent = '应用'
    apply.setAttribute('data-ns-filter-apply', '')
    apply.addEventListener('click', () => this.apply())
    const clear = document.createElement('button')
    clear.type = 'button'
    clear.textContent = '清除'
    clear.setAttribute('data-ns-filter-clear', '')
    clear.addEventListener('click', () => {
      this.callbacks.onApply(null)
      this.closeInternal(false)
    })
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.textContent = '取消'
    cancel.setAttribute('data-ns-filter-cancel', '')
    cancel.addEventListener('click', () => this.closeInternal(true))
    actions.append(apply, clear, cancel)
    this.popover.appendChild(actions)
  }

  private renderDraftControls(draft: Draft): void {
    if (draft.kind === 'text-contains') {
      const input = document.createElement('input')
      input.setAttribute('data-ns-filter-value', '')
      input.value = draft.value
      input.addEventListener('input', () => {
        draft.value = input.value
        this.updateApplyState()
      })
      this.popover.appendChild(input)
      return
    }

    if (draft.kind === 'number-between') {
      this.popover.appendChild(
        this.numberInput('min', draft.min, (value) => {
          draft.min = value
        }),
      )
      this.popover.appendChild(
        this.numberInput('max', draft.max, (value) => {
          draft.max = value
        }),
      )
      return
    }

    if (draft.kind === 'select-in') {
      for (const choice of getChoices(this.field)) {
        const label = document.createElement('label')
        label.setAttribute('data-ns-filter-choice', '')
        const checkbox = document.createElement('input')
        checkbox.type = 'checkbox'
        checkbox.value = choice
        checkbox.checked = draft.values.includes(choice)
        checkbox.addEventListener('change', () => {
          draft.values = checkbox.checked
            ? [...draft.values, choice]
            : draft.values.filter((value) => value !== choice)
          this.updateApplyState()
        })
        label.append(checkbox, choice)
        this.popover.appendChild(label)
      }
      return
    }

    if (draft.kind === 'date-between') {
      this.popover.appendChild(
        this.dateInput('start', draft.start, (value) => {
          draft.start = value
        }),
      )
      this.popover.appendChild(
        this.dateInput('end', draft.end, (value) => {
          draft.end = value
        }),
      )
      return
    }

    if (draft.kind === 'checkbox-equals') {
      const select = document.createElement('select')
      select.setAttribute('data-ns-filter-value', '')
      for (const [label, value] of [
        ['已勾选', 'true'],
        ['未勾选', 'false'],
      ] as const) {
        const option = document.createElement('option')
        option.value = value
        option.textContent = label
        select.appendChild(option)
      }
      select.value = String(draft.value)
      select.addEventListener('change', () => {
        draft.value = select.value === 'true'
        this.updateApplyState()
      })
      this.popover.appendChild(select)
    }
  }

  private numberInput(
    kind: 'min' | 'max',
    value: string,
    setValue: (value: string) => void,
  ): HTMLInputElement {
    const input = document.createElement('input')
    input.type = 'number'
    input.placeholder = kind === 'min' ? '最小值' : '最大值'
    input.setAttribute(`data-ns-filter-${kind}`, '')
    input.value = value
    input.addEventListener('input', () => {
      setValue(input.value)
      this.updateApplyState()
    })
    return input
  }

  private dateInput(
    kind: 'start' | 'end',
    value: string,
    setValue: (value: string) => void,
  ): HTMLInputElement {
    const input = document.createElement('input')
    input.type = 'date'
    input.placeholder = kind === 'start' ? '开始日期' : '结束日期'
    input.setAttribute(`data-ns-filter-${kind}`, '')
    input.value = value
    input.addEventListener('input', () => {
      setValue(input.value)
      this.updateApplyState()
    })
    return input
  }

  private apply(): void {
    const op = this.toFilterOp()
    if (!op) return
    this.callbacks.onApply(op)
    this.closeInternal(false)
  }

  private updateApplyState(): void {
    const apply = this.popover.querySelector<HTMLButtonElement>('[data-ns-filter-apply]')
    if (apply) apply.disabled = this.toFilterOp() == null
  }

  private toFilterOp(): FilterOp | null {
    const draft = this.draft
    if (!draft) return null
    if (draft.kind === 'text-contains') {
      const value = draft.value.trim()
      return value === ''
        ? null
        : { kind: 'text-contains', value, caseSensitive: draft.caseSensitive }
    }
    if (draft.kind === 'number-between') {
      const min = finiteOrNull(draft.min)
      const max = finiteOrNull(draft.max)
      return min == null && max == null ? null : { kind: 'number-between', min, max }
    }
    if (draft.kind === 'date-between') {
      const start = dateOrNull(draft.start)
      const end = dateOrNull(draft.end)
      return start == null && end == null ? null : { kind: 'date-between', start, end }
    }
    if (draft.kind === 'select-in') {
      return draft.values.length === 0 ? null : { kind: 'select-in', values: draft.values }
    }
    if (draft.kind === 'checkbox-equals') return { kind: 'checkbox-equals', value: draft.value }
    return { kind: 'is-not-empty' }
  }

  private closeInternal(cancel: boolean): void {
    if (!this.attached || !this.opened) return
    this.popover.removeAttribute('data-open')
    this.opened = false
    if (cancel) this.callbacks.onCancel()
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    this.closeInternal(true)
  }

  private onDocumentPointerDown = (event: Event): void => {
    if (!this.opened) return
    const target = event.target as Node | null
    if (target && this.popover.contains(target)) return
    this.closeInternal(true)
  }
}

function toDraft(field: Field, op: FilterOp | null): Draft {
  if (op) return draftFromOp(op)
  if (field.type === 'number') return { kind: 'number-between', min: '', max: '' }
  if (field.type === 'date') return { kind: 'date-between', start: '', end: '' }
  if (field.type === 'singleSelect' || field.type === 'multiSelect') {
    const choices = getChoices(field)
    return choices.length === 0 ? { kind: 'is-not-empty' } : { kind: 'select-in', values: [] }
  }
  if (field.type === 'checkbox') return { kind: 'checkbox-equals', value: true }
  return { kind: 'text-contains', value: '', caseSensitive: false }
}

function draftFromOp(op: FilterOp): Draft {
  if (op.kind === 'text-contains' || op.kind === 'text-equals') {
    return { kind: 'text-contains', value: op.value, caseSensitive: op.caseSensitive }
  }
  if (op.kind === 'number-between') {
    return {
      kind: 'number-between',
      min: op.min == null ? '' : String(op.min),
      max: op.max == null ? '' : String(op.max),
    }
  }
  if (op.kind === 'date-between') {
    return { kind: 'date-between', start: dateInputValue(op.start), end: dateInputValue(op.end) }
  }
  if (op.kind === 'select-in') return { kind: 'select-in', values: [...op.values] }
  if (op.kind === 'checkbox-equals') return { kind: 'checkbox-equals', value: op.value }
  return { kind: 'is-not-empty' }
}

function getChoices(field: Field | null): string[] {
  const choices = field?.options?.choices
  return Array.isArray(choices)
    ? choices.filter((choice): choice is string => typeof choice === 'string')
    : []
}

function finiteOrNull(value: string): number | null {
  if (value.trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function dateOrNull(value: string): Date | null {
  if (value.trim() === '') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function dateInputValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : ''
}
