// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — storybook docs display snippet; references
import { InMemoryDataSource, type Schema } from '@zhiguang/core'
import { createGridHost } from '../grid-host'
import { generateRows } from '../mock-data'

const schema: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 160 },
    { id: 'role', name: 'Role', type: 'text', width: 140 },
    { id: 'team', name: 'Team', type: 'text', width: 120 },
    { id: 'count', name: 'Count', type: 'number', width: 90 },
    { id: 'note', name: 'Note', type: 'text', width: 240 },
  ],
}

const data = new InMemoryDataSource({
  schema,
  rows: generateRows(schema, 1000),
})

createGridHost({ data })
