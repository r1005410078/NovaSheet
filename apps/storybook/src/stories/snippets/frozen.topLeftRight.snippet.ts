// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — storybook docs display snippet; references
import type { Field, Schema } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { GeneratedDataSource } from '../generated-data-source'

const metricFields: Field[] = Array.from({ length: 18 }, (_, i) => ({
  id: `metric_${String(i + 1).padStart(2, '0')}`,
  name: `指标 ${i + 1}`,
  type: (i + 1) % 3 === 0 ? 'number' : 'text',
  width: 100,
}))

const schema: Schema = {
  fields: [
    { id: 'employee', name: '员工', type: 'text', width: 120 },
    ...metricFields,
    { id: 'summary', name: '汇总', type: 'text', width: 180 },
  ],
}

const rowCount = 16
const hostHeight = 32 + 28 * rowCount

const data = new GeneratedDataSource(rowCount, schema, (row, fieldId) => {
  if (fieldId === 'employee') return `员工 ${row}`
  if (fieldId === 'summary') return `第 ${(row % 4) + 1} 季度汇总`
  return `指标-${row}`
})

createGridHost(
  {
    data,
    frozen: { topRows: 1, leftCols: 1, rightCols: 1 },
  },
  860,
  hostHeight,
)
