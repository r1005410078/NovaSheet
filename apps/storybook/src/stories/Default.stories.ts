import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { basicTextSchema, generateRows } from '../mock-data'
import { docsMeta, docsStory } from '../story-docs'
import { sources } from '../story-sources'

const meta: Meta = {
  title: '表格/默认',
  parameters: { layout: 'centered' },
  ...docsMeta('100 行 × 3 列纯文本，验证默认 `denseGridTheme`、列头与单元格对齐。'),
}
export default meta

type Story = StoryObj

export const HundredRowsThreeColumns: Story = {
  name: '100 行 × 3 列',
  ...docsStory(sources.default.hundredRows),
  render: () => {
    const schema = basicTextSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 100) })
    return createGridHost({ data })
  },
}
