import type { Meta, StoryObj } from '@storybook/html'
import { Grid } from '@novasheet/web'
import { InMemoryDataSource, type Schema } from '@novasheet/core'
import { generateRows } from '../mock-data'

const meta: Meta = {
  title: 'Grid/Sizing',
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj

/**
 * 演示 schema 自定义列宽（非均匀）+ 通过 setRowHeight 覆盖单行高度。
 */
export const CustomColumnWidthsAndRowHeights: Story = {
  render: () => {
    const schema: Schema = {
      fields: [
        { id: 'tiny', name: 'Tiny', type: 'text', width: 60 },
        { id: 'medium', name: 'Medium', type: 'text', width: 140 },
        { id: 'wide', name: 'Wide', type: 'text', width: 320 },
        { id: 'count', name: 'Count', type: 'number', width: 90 },
      ],
    }
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 60) })

    const el = document.createElement('div')
    el.style.width = '780px'
    el.style.height = '480px'
    el.style.position = 'relative'
    const grid = new Grid(el, { data })
    // 前 3 行依次高 56 / 40 / 20，凸显非均匀行高对网格线的影响。
    grid.setRowHeight(0, 56)
    grid.setRowHeight(1, 40)
    grid.setRowHeight(2, 20)
    return el
  },
}
