import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { docsMeta, docsStory } from '../story-docs'
import basicSrc from './snippets/fill-handle.basic.snippet.ts?raw'

const meta: Meta = {
  title: '表格/填充柄',
  parameters: { layout: 'centered' },
  ...docsMeta(
    'Phase 4.3：选区右下角 DOM fill handle；支持向下/上/右/左拖拽，单值复制、数字等差、文本尾号、Date 序列，拖拽 preview，一次 fill 进入 undo/redo，并触发 Grid.onFill()。',
  ),
}
export default meta
type Story = StoryObj

export const Basic: Story = {
  name: '序列填充',
  ...docsStory(
    basicSrc,
    '选中前两行的 Task / Count / Due / Done 单元格，拖动选区右下角的小方块向下填充；状态栏会显示最近一次 fill 方向和目标范围。',
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
      { task: 'Item 001', count: 1, due: new Date('2026-01-01T00:00:00Z'), done: false },
      { task: 'Item 002', count: 3, due: new Date('2026-01-03T00:00:00Z'), done: true },
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
    status.textContent = '最近填充: (无)'

    const gridContainer = document.createElement('div')
    Object.assign(gridContainer.style, { flex: '1', minHeight: '0', position: 'relative' })

    wrapper.appendChild(status)
    wrapper.appendChild(gridContainer)

    const gridEl = createGridHost({
      data,
      onFill: (event) => {
        status.textContent = `最近填充: ${event.direction} R${event.fill.startRow + 1}:R${event.fill.endRow + 1}, C${event.fill.startCol + 1}:C${event.fill.endCol + 1}`
      },
    }, '100%', '100%')
    gridContainer.appendChild(gridEl)

    return wrapper
  },
}
