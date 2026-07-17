import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource, dateToSerial } from '@zhiguang/core'
import type { CellFormatter, CellRange, Row, Schema, ValueFormat } from '@zhiguang/core'
import { createGridHost } from '../grid-host'
import { docsMeta, docsStory } from '../story-docs'
import basicSrc from './snippets/value-formatting.basic.snippet.ts?raw'

const meta: Meta = {
  title: 'Table/Value formatting',
  parameters: { layout: 'centered' },
  ...docsMeta(
    'Phase 5-C: value formatters turn a raw cell value into display text without changing the underlying data. ' +
      'Column-level defaults come from `Field.format`; cell-level overrides go through `Grid.setValueFormat` and are undoable. ' +
      'Built-in descriptors cover number / currency / percent / date; custom formatters register by id via `GridOptions.formatters`. ' +
      'Sorting, editing and export still operate on the raw value.',
  ),
}
export default meta
type Story = StoryObj

/** zh-CN renders CNY as ¥; en-US would render it as CN¥ (Intl disambiguation). */
const LOCALE = 'zh-CN'

const fileSize: CellFormatter = (v) => `${((v as number) / (1024 * 1024)).toFixed(1)} MB`

function formattedSchema(): Schema {
  return {
    fields: [
      { id: 'product', name: 'Product', type: 'text', width: 150 },
      { id: 'amount', name: 'Amount', type: 'number', width: 130, format: { kind: 'currency', currency: 'CNY' } },
      { id: 'margin', name: 'Margin', type: 'number', width: 100, format: { kind: 'percent', decimals: 2 } },
      { id: 'qty', name: 'Qty', type: 'number', width: 120, format: { kind: 'number', thousands: true } },
      { id: 'updated', name: 'Updated', type: 'date', width: 130, format: { kind: 'date', pattern: 'YYYY-MM-DD' } },
      { id: 'size', name: 'Size', type: 'number', width: 110, format: { kind: 'custom', formatterId: 'fileSize' } },
    ],
  }
}

function sampleRows(): Row[] {
  const products = ['Widget A', 'Gadget B', 'Sprocket C', 'Module D', 'Panel E', 'Sensor F', 'Cable G', 'Relay H']
  return products.map((product, i) => ({
    product,
    amount: 1234.5 + i * 875.25,
    margin: 0.04 + i * 0.0317,
    qty: 1_234_567 - i * 98_765,
    updated: dateToSerial(new Date(Date.UTC(2024, 5, 3 + i))),
    size: (i + 1) * 524_288,
  }))
}

export const Basic: Story = {
  name: 'Value formatting',
  ...docsStory(
    basicSrc,
    'Columns carry default formats via `Field.format`. The toolbar applies a format to the current selection through ' +
      '`setValueFormat` (cell-level override, undoable). Raw values are unchanged — sort a formatted column to confirm.',
  ),
  render: () => {
    const schema = formattedSchema()
    const data = new InMemoryDataSource({ schema, rows: sampleRows() })

    const wrapper = document.createElement('div')
    Object.assign(wrapper.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      padding: '8px',
      width: '780px',
      height: '460px',
      boxSizing: 'border-box',
    })

    const toolbar = document.createElement('div')
    Object.assign(toolbar.style, { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' })

    function makeBtn(label: string): HTMLButtonElement {
      const btn = document.createElement('button')
      btn.textContent = label
      Object.assign(btn.style, { padding: '4px 10px', cursor: 'pointer' })
      return btn
    }

    const currencyBtn = makeBtn('Currency ¥')
    const percentBtn = makeBtn('Percent')
    const number2Btn = makeBtn('Number 2dp')
    const dateBtn = makeBtn('Date')
    const undoBtn = makeBtn('Undo')
    const redoBtn = makeBtn('Redo')
    undoBtn.disabled = true
    redoBtn.disabled = true

    const statusEl = document.createElement('span')
    Object.assign(statusEl.style, { fontFamily: 'monospace', fontSize: '12px', color: '#555' })
    statusEl.textContent = 'Select a range, then apply a format'

    for (const btn of [currencyBtn, percentBtn, number2Btn, dateBtn, undoBtn, redoBtn]) {
      toolbar.appendChild(btn)
    }
    toolbar.appendChild(statusEl)

    const gridContainer = document.createElement('div')
    Object.assign(gridContainer.style, { flex: '1', minHeight: '0', position: 'relative' })

    wrapper.appendChild(toolbar)
    wrapper.appendChild(gridContainer)

    const gridEl = createGridHost({ data, locale: LOCALE, formatters: { fileSize } }, '100%', '100%')
    gridContainer.appendChild(gridEl)

    const grid = (gridEl as unknown as HTMLElement & { __grid: import('@zhiguang/core').Grid }).__grid

    function syncButtons(): void {
      undoBtn.disabled = !grid.canUndo()
      redoBtn.disabled = !grid.canRedo()
    }

    function apply(format: ValueFormat, label: string): void {
      const range: CellRange | null = grid.getSelection().selectedRange
      if (!range) {
        statusEl.textContent = `${label} failed (no selection)`
        return
      }
      const ok = grid.setValueFormat(range, format)
      statusEl.textContent = ok ? `Applied ${label}` : `${label} failed (non-contiguous selection)`
      syncButtons()
    }

    currencyBtn.addEventListener('click', () => apply({ kind: 'currency', currency: 'CNY' }, 'currency'))
    percentBtn.addEventListener('click', () => apply({ kind: 'percent', decimals: 1 }, 'percent'))
    number2Btn.addEventListener('click', () => apply({ kind: 'number', decimals: 2, thousands: true }, 'number 2dp'))
    dateBtn.addEventListener('click', () => apply({ kind: 'date', pattern: 'YYYY/MM/DD' }, 'date'))

    undoBtn.addEventListener('click', () => {
      grid.undo()
      statusEl.textContent = 'Undone'
      syncButtons()
    })
    redoBtn.addEventListener('click', () => {
      grid.redo()
      statusEl.textContent = 'Redone'
      syncButtons()
    })

    const pollId = window.setInterval(syncButtons, 200)
    wrapper.dataset['pollId'] = String(pollId)

    return wrapper
  },
}
