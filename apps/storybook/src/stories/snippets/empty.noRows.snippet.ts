import { InMemoryDataSource } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { basicTextSchema } from '../mock-data'

const data = new InMemoryDataSource({
  schema: basicTextSchema(),
  rows: [],
})

createGridHost({ data }, 720, 280)
