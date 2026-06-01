import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { basicTextSchema, generateRows } from '../mock-data'
import { docsMeta, docsStory } from '../story-docs'
import { withExcelHeaders } from '@novasheet/sheet'

const meta: Meta = {
  title: 'Table/Excel facade',
  ...docsMeta(
    'With `excelHeaders: true`, column headers show A/B/... labels, the left rail shows 1-based row numbers, and the top-left corner renders the intersection cell.',
  ),
}
export default meta

type Story = StoryObj

export const WithRowAndColumnHeaders: Story = {
  name: 'Column letters and row numbers',
  ...docsStory(`import { InMemoryDataSource } from '@novasheet/core'
import { withExcelHeaders } from '@novasheet/sheet'
import { createGridHost } from '../grid-host'
import { basicTextSchema, generateRows } from '../mock-data'

const data = new InMemoryDataSource({
  schema: basicTextSchema(),
  rows: generateRows(basicTextSchema(), 50),
})

createGridHost(withExcelHeaders({ data }))`),
  render: () => {
    const schema = basicTextSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 50) })
    return createGridHost(withExcelHeaders({ data }))
  },
}
