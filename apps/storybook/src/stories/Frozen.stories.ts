import type { Meta, StoryObj } from '@storybook/html'
import type { Field, Schema } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { GeneratedDataSource } from '../generated-data-source'
import { docsMeta, docsStory } from '../story-docs'
import frozenTopLeftRightSrc from './snippets/frozen.topLeftRight.snippet.ts?raw'

const meta: Meta = {
  title: '表格/冻结',
  ...docsMeta('顶行 + 左列 + 右列冻结（20 列）；中间列可横向滚动。画布尺寸随 Storybook 视口变化。'),
}
export default meta

type Story = StoryObj

const METRIC_COUNT = 18
/** 可视区内完整展示、无纵向滚动条（header 32 + rowHeight 28 × N） */
const STORY_ROW_COUNT = 16
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
  ...docsStory(frozenTopLeftRightSrc, '16 行数据；视口随画布高度变化，行数超出时出现纵向滚动。'),
  render: () => {
    const data = new GeneratedDataSource(STORY_ROW_COUNT, schema, (row, fieldId) => {
      if (fieldId === 'employee') return `员工 ${row}`
      if (fieldId === 'summary') return `第 ${(row % 4) + 1} 季度汇总 · 第 ${row} 行`
      if (fieldId.startsWith('metric_')) {
        const n = Number.parseInt(fieldId.slice('metric_'.length), 10)
        return n % 3 === 0 ? row * n + 42 : `${regions[row % regions.length]!}·${teams[row % teams.length]!}`
      }
      return ''
    })

    return createGridHost({
      data,
      frozen: { topRows: 1, leftCols: 1, rightCols: 1 },
    })
  },
}
