import { InMemoryDataSource } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { generateRows, mixedTypesSchema } from '../mock-data'

const schema = mixedTypesSchema()
const data = new InMemoryDataSource({
  schema,
  rows: generateRows(schema, 50),
})

createGridHost({ data })
