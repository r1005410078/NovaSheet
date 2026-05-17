import { InMemoryDataSource, type Schema } from '@novasheet/core'
import { createGridHost } from '../grid-host'

const schema: Schema = {
  fields: [
    { id: 'idx', name: 'Index', type: 'number', width: 80 },
    { id: 'name', name: 'Name', type: 'text', width: 200 },
    { id: 'category', name: 'Category', type: 'text', width: 160 },
    { id: 'value', name: 'Value', type: 'number', width: 120 },
  ],
}

const rows = Array.from({ length: 10_000 }, (_, i) => ({
  idx: i,
  name: `Item ${i}`,
  category: ['alpha', 'beta', 'gamma', 'delta'][i % 4],
  value: Math.round(Math.sin(i) * 10_000) / 100,
}))

createGridHost({ data: new InMemoryDataSource({ schema, rows }) })
