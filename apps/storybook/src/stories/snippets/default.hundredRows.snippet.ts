import { InMemoryDataSource } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { basicTextSchema, generateRows } from '../mock-data'

const schema = basicTextSchema()
const data = new InMemoryDataSource({
  schema,
  rows: generateRows(schema, 100),
})

createGridHost({ data })
