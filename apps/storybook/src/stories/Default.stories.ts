import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { basicTextSchema, generateRows } from '../mock-data'

const meta: Meta = {
  title: 'Grid/Default',
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj

/**
 * 100 行 × 3 列纯文本——验证默认 theme + 默认行高下的列对齐与列头渲染。
 * M1 只有最上方约 17 行可见。
 */
export const HundredRowsThreeColumns: Story = {
  render: () => {
    const schema = basicTextSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 100) })
    return createGridHost({ data })
  },
}
