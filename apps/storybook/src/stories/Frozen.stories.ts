import type { Meta, StoryObj } from '@storybook/html'
import type { Field, Schema } from '@zhiguang/novasheet-core'
import { createGridHost } from '../grid-host'
import { GeneratedDataSource } from '../generated-data-source'
import { docsMeta, docsStory } from '../story-docs'
import frozenTopLeftRightSrc from './snippets/frozen.topLeftRight.snippet.ts?raw'

const meta: Meta = {
  title: 'Table/Frozen regions',
  ...docsMeta(
    'Top row plus left and right frozen columns across 20 columns. The middle columns can scroll horizontally, and the canvas follows the Storybook viewport size.',
  ),
}
export default meta

type Story = StoryObj

const METRIC_COUNT = 18
/** Fully visible in the viewport without vertical scrolling (header 32 + rowHeight 28 x N). */
const STORY_ROW_COUNT = 16
const metricFields: Field[] = Array.from({ length: METRIC_COUNT }, (_, i) => {
  const n = i + 1
  const id = `metric_${String(n).padStart(2, '0')}`
  return {
    id,
    name: `Metric ${n}`,
    type: n % 3 === 0 ? 'number' : 'text',
    width: 100,
  }
})

const schema: Schema = {
  fields: [
    { id: 'employee', name: 'Employee', type: 'text', width: 120 },
    ...metricFields,
    { id: 'summary', name: 'Summary', type: 'text', width: 180 },
  ],
}

const teams = ['Platform', 'Data', 'Design', 'Operations']
const regions = ['North', 'East', 'South', 'West']

export const FrozenTopLeftAndRight: Story = {
  name: 'Top row + left/right frozen columns (20 columns)',
  ...docsStory(
    frozenTopLeftRightSrc,
    '16 rows of data. The viewport follows the canvas height, and vertical scrolling appears when rows overflow.',
  ),
  render: () => {
    const data = new GeneratedDataSource(STORY_ROW_COUNT, schema, (row, fieldId) => {
      if (fieldId === 'employee') return `Employee ${row}`
      if (fieldId === 'summary') return `Q${(row % 4) + 1} summary · row ${row}`
      if (fieldId.startsWith('metric_')) {
        const n = Number.parseInt(fieldId.slice('metric_'.length), 10)
        return n % 3 === 0
          ? row * n + 42
          : `${regions[row % regions.length]!}·${teams[row % teams.length]!}`
      }
      return ''
    })

    return createGridHost({
      data,
      frozen: { topRows: 1, leftCols: 1, rightCols: 1 },
    })
  },
}
