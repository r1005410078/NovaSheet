import { describe, expect, it, mock } from 'bun:test'
import { denseGridTheme, type Field, type FilterOp } from '@novasheet/core'
import { FilterPopover } from '../../src/interaction/FilterPopover'

function makeContainer(): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  return container
}

function openPopover(field: Field) {
  const container = makeContainer()
  const onApply = mock((_op: FilterOp | null) => {})
  const onCancel = mock(() => {})
  const popover = new FilterPopover(container, { onApply, onCancel })
  popover.attach()
  popover.open({ clientX: 20, clientY: 30 }, { field })
  return { container, onApply, onCancel, popover }
}

function applyButton(): HTMLButtonElement {
  return document.body.querySelector('[data-ns-filter-apply]') as HTMLButtonElement
}

function valueInput(): HTMLInputElement {
  return document.body.querySelector('[data-ns-filter-value]') as HTMLInputElement
}

describe('FilterPopover', () => {
  it('text op requires non-empty value before Apply enables', () => {
    const { container, popover } = openPopover({ id: 'name', name: 'Name', type: 'text', width: 100 })

    expect(applyButton().disabled).toBe(true)
    valueInput().value = 'Ada'
    valueInput().dispatchEvent(new Event('input', { bubbles: true }))

    expect(applyButton().disabled).toBe(false)
    popover.destroy()
    document.body.removeChild(container)
  })

  it('injects themed popover stylesheet and variables', () => {
    const { container, popover } = openPopover({ id: 'name', name: 'Name', type: 'text', width: 100 })

    popover.applyTheme(denseGridTheme)

    expect(document.getElementById('novasheet-filter-popover-style')).toBeTruthy()
    const layer = document.body.querySelector('[data-novasheet-filter-popover-layer]') as HTMLElement
    expect(layer.style.getPropertyValue('--ns-filter-popover-bg')).toBe(denseGridTheme.colors.background)
    expect(layer.style.getPropertyValue('--ns-filter-popover-font')).toBe(denseGridTheme.metrics.fontFamily)

    popover.destroy()
    document.body.removeChild(container)
  })

  it('number-between enables when min or max is finite', () => {
    const { container, popover } = openPopover({ id: 'score', name: 'Score', type: 'number', width: 100 })
    const min = document.body.querySelector('[data-ns-filter-min]') as HTMLInputElement

    expect(applyButton().disabled).toBe(true)
    min.value = '10'
    min.dispatchEvent(new Event('input', { bubbles: true }))

    expect(applyButton().disabled).toBe(false)
    popover.destroy()
    document.body.removeChild(container)
  })

  it('labels number range inputs with clear placeholders', () => {
    const { container, popover } = openPopover({ id: 'score', name: 'Score', type: 'number', width: 100 })

    expect((document.body.querySelector('[data-ns-filter-min]') as HTMLInputElement).placeholder).toBe('Min')
    expect((document.body.querySelector('[data-ns-filter-max]') as HTMLInputElement).placeholder).toBe('Max')

    popover.destroy()
    document.body.removeChild(container)
  })

  it('select-in hides when choices are empty and defaults to is-not-empty', () => {
    const { container, popover, onApply } = openPopover({
      id: 'status',
      name: 'Status',
      type: 'singleSelect',
      width: 100,
      options: { choices: [] },
    })

    expect(document.body.querySelector('[data-ns-filter-choice]')).toBeNull()
    expect(applyButton().disabled).toBe(false)
    applyButton().click()

    expect(onApply).toHaveBeenCalledWith({ kind: 'is-not-empty' })
    popover.destroy()
    document.body.removeChild(container)
  })

  it('Apply calls onApply(op)', () => {
    const { container, popover, onApply } = openPopover({ id: 'name', name: 'Name', type: 'text', width: 100 })
    valueInput().value = 'Ada'
    valueInput().dispatchEvent(new Event('input', { bubbles: true }))

    applyButton().click()

    expect(onApply).toHaveBeenCalledWith({ kind: 'text-contains', value: 'Ada', caseSensitive: false })
    expect(popover.isOpen()).toBe(false)
    popover.destroy()
    document.body.removeChild(container)
  })

  it('Clear calls onApply(null)', () => {
    const { container, popover, onApply } = openPopover({ id: 'name', name: 'Name', type: 'text', width: 100 })

    ;(document.body.querySelector('[data-ns-filter-clear]') as HTMLButtonElement).click()

    expect(onApply).toHaveBeenCalledWith(null)
    expect(popover.isOpen()).toBe(false)
    popover.destroy()
    document.body.removeChild(container)
  })

  it('Cancel / Escape / outside click calls onCancel', () => {
    const { container, popover, onCancel } = openPopover({ id: 'name', name: 'Name', type: 'text', width: 100 })

    ;(document.body.querySelector('[data-ns-filter-cancel]') as HTMLButtonElement).click()
    expect(onCancel).toHaveBeenCalledTimes(1)

    popover.open({ clientX: 20, clientY: 30 }, { field: { id: 'name', name: 'Name', type: 'text', width: 100 } })
    ;(document.body.querySelector('[data-novasheet-filter-popover]') as HTMLElement).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    )
    expect(onCancel).toHaveBeenCalledTimes(2)

    popover.open({ clientX: 20, clientY: 30 }, { field: { id: 'name', name: 'Name', type: 'text', width: 100 } })
    document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(onCancel).toHaveBeenCalledTimes(3)

    popover.destroy()
    document.body.removeChild(container)
  })
})
