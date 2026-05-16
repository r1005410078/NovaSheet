import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource, type Schema } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { generateRows } from '../mock-data'

const meta: Meta = {
  title: 'Grid/Larger',
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj

/**
 * 1000 行 × 5 列。M1 没有滚动；500px 高的 host 一帧只能展示 ~17 行，
 * 其余 ~983 行落在视口外但占据 axis 的逻辑空间。
 * 本 story 是 M1 的「视觉限制证物」——M2 落地后该 story 也是验证滚动行为的回归素材。
 */
export const ThousandRowsFiveColumns: Story = {
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
