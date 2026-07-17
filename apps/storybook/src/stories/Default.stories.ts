import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource } from '@zhiguang/novasheet-core'
import { createGridHost } from '../grid-host'
import { basicTextSchema, generateRows } from '../mock-data'
import { docsMeta, docsStory } from '../story-docs'
import hundredRowsSrc from './snippets/default.hundredRows.snippet.ts?raw'

const meta: Meta = {
  title: 'Table/Default',
  ...docsMeta(
    '100 rows x 3 text columns for checking the default `denseGridTheme`, headers, and cell alignment.',
  ),
}
export default meta

type Story = StoryObj

export const HundredRowsThreeColumns: Story = {
  name: '100 rows x 3 columns',
  ...docsStory(hundredRowsSrc),
  render: () => {
    const schema = basicTextSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 100) })
    return createGridHost({ data })
  },
}
