// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — storybook docs display snippet; references
import type { Field, Schema } from '@zhiguang/core'
import { createGridHost } from '../grid-host'
import { GeneratedDataSource } from '../generated-data-source'

const metricFields: Field[] = Array.from({ length: 18 }, (_, i) => ({
  id: `metric_${String(i + 1).padStart(2, '0')}`,
  name: `Metric ${i + 1}`,
  type: (i + 1) % 3 === 0 ? 'number' : 'text',
  width: 100,
}))

const schema: Schema = {
  fields: [
    { id: 'employee', name: 'Employee', type: 'text', width: 120 },
    ...metricFields,
    { id: 'summary', name: 'Summary', type: 'text', width: 180 },
  ],
}

const data = new GeneratedDataSource(16, schema, (row, fieldId) => {
  if (fieldId === 'employee') return `Employee ${row}`
  if (fieldId === 'summary') return `Q${(row % 4) + 1} summary`
  return `Metric-${row}`
})

createGridHost({
  data,
  frozen: { topRows: 1, leftCols: 1, rightCols: 1 },
})
