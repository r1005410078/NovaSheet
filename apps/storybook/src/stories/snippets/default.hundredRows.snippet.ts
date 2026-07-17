// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — storybook docs display snippet; references
import { InMemoryDataSource } from '@zhiguang/novasheet-core'
import { createGridHost } from '../grid-host'
import { basicTextSchema, generateRows } from '../mock-data'

const schema = basicTextSchema()
const data = new InMemoryDataSource({
  schema,
  rows: generateRows(schema, 100),
})

createGridHost({ data })
