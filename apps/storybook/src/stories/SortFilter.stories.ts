import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource, dateToSerial, type Row, type Schema } from '@zhiguang/core'
import { createGridHost } from '../grid-host'
import { docsMeta, docsStory } from '../story-docs'

const meta: Meta = {
  title: 'Table/Sort and filter',
  parameters: { layout: 'fullscreen' },
  ...docsMeta(
    'Phase 4.4: column header context menus provide sorting and filtering. Headers render sort/filter state icons, and filters support text, number, date, select, and checkbox fields.',
  ),
}
export default meta

type Story = StoryObj

const source = `
const schema = {
  fields: [
    { id: 'task', name: 'Task', type: 'text', width: 180 },
    { id: 'score', name: 'Score', type: 'number', width: 100 },
    { id: 'due', name: 'Due', type: 'date', width: 140 },
    { id: 'status', name: 'Status', type: 'singleSelect', width: 130, options: { choices: ['Todo', 'Doing', 'Blocked', 'Done'] } },
    { id: 'tags', name: 'Tags', type: 'multiSelect', width: 180, options: { choices: ['frontend', 'backend', 'design', 'ops'] } },
    { id: 'done', name: 'Done', type: 'checkbox', width: 90 },
  ],
}

const data = new InMemoryDataSource({ schema, rows })
createGridHost({ data })
`

export const Basic: Story = {
  name: 'Column header sort and filter',
  ...docsStory(
    source,
    'Right-click any column header to open the menu. Choose Sort ascending / descending or Filter... to inspect row order, row count, and header icons.',
  ),
  render: () => {
    const data = new InMemoryDataSource({ schema: sortFilterSchema(), rows: sortFilterRows(80) })
    return createGridHost({ data })
  },
}

function sortFilterSchema(): Schema {
  return {
    fields: [
      { id: 'task', name: 'Task', type: 'text', width: 180 },
      { id: 'score', name: 'Score', type: 'number', width: 100 },
      { id: 'due', name: 'Due', type: 'date', width: 140 },
      {
        id: 'status',
        name: 'Status',
        type: 'singleSelect',
        width: 130,
        options: { choices: ['Todo', 'Doing', 'Blocked', 'Done'] },
      },
      {
        id: 'tags',
        name: 'Tags',
        type: 'multiSelect',
        width: 180,
        options: { choices: ['frontend', 'backend', 'design', 'ops'] },
      },
      { id: 'done', name: 'Done', type: 'checkbox', width: 90 },
    ],
  }
}

function sortFilterRows(count: number): Row[] {
  const statuses = ['Todo', 'Doing', 'Blocked', 'Done']
  const tags = ['frontend', 'backend', 'design', 'ops']
  const base = Date.UTC(2026, 0, 1)
  return Array.from({ length: count }, (_, index) => ({
    task: `Task ${String(index + 1).padStart(3, '0')}`,
    score: (index * 17) % 100,
    due: dateToSerial(new Date(base + index * 86400000)),
    status: statuses[index % statuses.length]!,
    tags: [tags[index % tags.length]!, tags[(index + 1) % tags.length]!],
    done: index % 3 === 0,
  }))
}
