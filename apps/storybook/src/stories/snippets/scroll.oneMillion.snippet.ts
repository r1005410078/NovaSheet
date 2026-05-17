import type { Schema } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { GeneratedDataSource } from '../generated-data-source'

const colCount = 30
const schema: Schema = {
  fields: Array.from({ length: colCount }, (_, c) => ({
    id: `c${c}`,
    name: `Column ${c}`,
    type: c % 3 === 0 ? 'number' : 'text',
    width: 140,
  })),
}

const data = new GeneratedDataSource(1_000_000, schema, (r, fieldId) => {
  const c = Number(fieldId.slice(1))
  return c % 3 === 0 ? r * 100 + c : `r${r}-c${c}`
})

createGridHost({ data })
