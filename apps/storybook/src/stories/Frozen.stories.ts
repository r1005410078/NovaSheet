import type { Meta, StoryObj } from '@storybook/html'
import { Grid } from '@novasheet/web'
import type { Field, Schema } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { GeneratedDataSource } from '../generated-data-source'
import { docsMeta, docsStory } from '../story-docs'
import { sources } from '../story-sources'

const meta: Meta = {
  title: '表格/冻结',
  parameters: { layout: 'centered' },
  ...docsMeta('顶行 + 左列 + 右列冻结（20 列）；中间列可横向滚动。'),
}
export default meta

type Story = StoryObj

const METRIC_COUNT = 18

const metricFields: Field[] = Array.from({ length: METRIC_COUNT }, (_, i) => {
  const n = i + 1
  const id = `metric_${String(n).padStart(2, '0')}`
  return {
    id,
    name: `指标 ${n}`,
    type: n % 3 === 0 ? 'number' : 'text',
    width: 100,
  }
})

const schema: Schema = {
  fields: [
    { id: 'employee', name: '员工', type: 'text', width: 120 },
    ...metricFields,
    { id: 'summary', name: '汇总', type: 'text', width: 180 },
  ],
}

const teams = ['平台', '数据', '设计', '运维']
const regions = ['华北', '华东', '华南', '西南']

export const FrozenTopLeftAndRight: Story = {
  name: '顶行 + 左右列冻结（20 列）',
  ...docsStory(sources.frozen.topLeftRight, '初始滚到 `metric_10`，观察左右冻结列。'),
  render: () => {
    const data = new GeneratedDataSource(1_000, schema, (row, fieldId) => {
      if (fieldId === 'employee') return `员工 ${row}`
      if (fieldId === 'summary') return `第 ${(row % 4) + 1} 季度汇总 · 第 ${row} 行`
      if (fieldId.startsWith('metric_')) {
        const n = Number.parseInt(fieldId.slice('metric_'.length), 10)
        return n % 3 === 0 ? row * n + 42 : `${regions[row % regions.length]!}·${teams[row % teams.length]!}`
      }
      return ''
    })

    const host = createGridHost({
      data,
      frozen: { topRows: 1, leftCols: 1, rightCols: 1 },
    })
    requestAnimationFrame(() => {
      const grid = (host as HTMLElement & { __grid: Grid }).__grid
      grid.scrollToCell(24, 'metric_10')
    })
    return host
  },
}
