// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — storybook docs display snippet; references
import { InMemoryDataSource } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { basicTextSchema, generateRows } from '../mock-data'

const data = new InMemoryDataSource({
  schema: basicTextSchema(),
  rows: generateRows(basicTextSchema(), 200),
})

// Click the grid first. Once the scroll host has focus, keyboard navigation works without extra API calls.
createGridHost({ data })
