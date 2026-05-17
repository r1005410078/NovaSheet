import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { generateRows, mixedTypesSchema } from '../mock-data'

const meta: Meta = {
  title: '表格/字段类型',
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj

/**
 * 全部 7 种 FieldType 各一列。M1 只为 text / number 提供专门绘制；其余通过 toString
 * 走文本 fallback。本 story 是回归视觉，确认 fallback 不崩溃 + 列头按类型对齐配置。
 */
export const AllSevenTypes: Story = {
  name: '七种字段类型',
  render: () => {
    const schema = mixedTypesSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 50) })
    return createGridHost({ data })
  },
}
