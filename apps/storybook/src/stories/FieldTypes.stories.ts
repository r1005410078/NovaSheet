import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { generateRows, mixedTypesSchema } from '../mock-data'
import { docsMeta, docsStory } from '../story-docs'
import { sources } from '../story-sources'

const meta: Meta = {
  title: '表格/字段类型',
  parameters: { layout: 'centered' },
  ...docsMeta('7 种 `FieldType` 各一列；`text` / `number` 有专门绘制路径，其余走文本 fallback。'),
}
export default meta

type Story = StoryObj

export const AllSevenTypes: Story = {
  name: '七种字段类型',
  ...docsStory(sources.fieldTypes.allSeven),
  render: () => {
    const schema = mixedTypesSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 50) })
    return createGridHost({ data })
  },
}
