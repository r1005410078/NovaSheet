import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource, dateToSerial } from '@zhiguang/novasheet-core'
import { createGridHost } from '../grid-host'
import { docsMeta, docsStory } from '../story-docs'
import basicSrc from './snippets/fill-handle.basic.snippet.ts?raw'

const meta: Meta = {
  title: 'Table/Fill handle',
  parameters: { layout: 'centered' },
  ...docsMeta(
    'Phase 4.3: a DOM fill handle appears at the bottom-right of the selection. It supports dragging down/up/right/left, single-value copy, numeric series, text suffix series, Date series, drag preview, undo/redo integration, and Grid.onFill().',
  ),
}
export default meta
type Story = StoryObj

export const Basic: Story = {
  name: 'Series fill',
  ...docsStory(
    basicSrc,
    'Select the first two rows of Task / Count / Due / Done cells, then drag the small square at the bottom-right of the selection downward. The status line shows the latest fill direction and target range.',
  ),
  render: () => {
    const schema = {
      fields: [
        { id: 'task', name: 'Task', type: 'text' as const, width: 160 },
        { id: 'count', name: 'Count', type: 'number' as const, width: 100 },
        { id: 'due', name: 'Due', type: 'date' as const, width: 160 },
        { id: 'done', name: 'Done', type: 'checkbox' as const, width: 90 },
      ],
    }

    const rows = [
      { task: 'Item 001', count: 1, due: dateToSerial(new Date('2026-01-01T00:00:00Z')), done: false },
      { task: 'Item 002', count: 3, due: dateToSerial(new Date('2026-01-03T00:00:00Z')), done: true },
      { task: null, count: null, due: null, done: null },
      { task: null, count: null, due: null, done: null },
      { task: null, count: null, due: null, done: null },
      { task: null, count: null, due: null, done: null },
    ]

    const data = new InMemoryDataSource({ schema, rows })
    const wrapper = document.createElement('div')
    Object.assign(wrapper.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      width: '720px',
      height: '360px',
      padding: '8px',
      boxSizing: 'border-box',
    })

    const status = document.createElement('div')
    Object.assign(status.style, {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#555',
      minHeight: '18px',
    })
    status.textContent = 'Latest fill: (none)'

    const gridContainer = document.createElement('div')
    Object.assign(gridContainer.style, { flex: '1', minHeight: '0', position: 'relative' })

    wrapper.appendChild(status)
    wrapper.appendChild(gridContainer)

    const gridEl = createGridHost(
      {
        data,
        onFill: (event) => {
          status.textContent = `Latest fill: ${event.direction} R${event.fill.startRow + 1}:R${event.fill.endRow + 1}, C${event.fill.startCol + 1}:C${event.fill.endCol + 1}`
        },
      },
      '100%',
      '100%',
    )
    gridContainer.appendChild(gridEl)

    return wrapper
  },
}
