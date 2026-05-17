import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { basicTextSchema } from '../mock-data'

const meta: Meta = {
  title: '表格/空数据',
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj

/**
 * rowCount = 0——验证空数据状态：列头照常绘制，正文区域为空主题底色。
 */
export const NoRows: Story = {
  name: '无数据行',
  render: () => {
    const schema = basicTextSchema()
    const data = new InMemoryDataSource({ schema, rows: [] })
    return createGridHost({ data })
  },
}
