import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource, type Schema } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { generateRows } from '../mock-data'
import { docsMeta, docsStory } from '../story-docs'
import thousandRowsSrc from './snippets/larger.thousandRows.snippet.ts?raw'

const meta: Meta = {
  title: '表格/大数据',
  ...docsMeta('1000 行 × 5 列，配合原生滚动查看视口外内容。'),
}
export default meta

type Story = StoryObj

export const ThousandRowsFiveColumns: Story = {
  name: '1000 行 × 5 列',
  ...docsStory(thousandRowsSrc),
  render: () => {
    const schema: Schema = {
      fields: [
        { id: 'name', name: 'Name', type: 'text', width: 160 },
        { id: 'role', name: 'Role', type: 'text', width: 140 },
        { id: 'team', name: 'Team', type: 'text', width: 120 },
        { id: 'count', name: 'Count', type: 'number', width: 90 },
        { id: 'note', name: 'Note', type: 'text', width: 240 },
      ],
    }
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 1000) })
    return createGridHost({ data })
  },
}
