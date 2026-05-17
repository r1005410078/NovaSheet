import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { basicTextSchema } from '../mock-data'
import { docsMeta, docsStory } from '../story-docs'
import noRowsSrc from './snippets/empty.noRows.snippet.ts?raw'

const meta: Meta = {
  title: '表格/空数据',
  parameters: { layout: 'centered' },
  ...docsMeta('`rowCount = 0` 时仍绘制列头；正文区显示 SVG 空状态插画与提示文案。'),
}
export default meta

type Story = StoryObj

export const NoRows: Story = {
  name: '无数据行',
  ...docsStory(noRowsSrc),
  render: () => {
    const schema = basicTextSchema()
    const data = new InMemoryDataSource({ schema, rows: [] })
    return createGridHost({ data }, 720, 280)
  },
}
