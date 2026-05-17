import { InMemoryDataSource, denseGridTheme } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { basicTextSchema, generateRows } from '../mock-data'

const schema = basicTextSchema()
const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 80) })
createGridHost({ data, theme: denseGridTheme })
