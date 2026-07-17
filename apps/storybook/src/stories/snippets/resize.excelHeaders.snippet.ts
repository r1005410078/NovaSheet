// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — storybook docs display snippet; references
import { InMemoryDataSource } from '@zhiguang/novasheet-core'
import { withExcelHeaders } from '@zhiguang/novasheet-core'
import { createGridHost } from '../grid-host'
import { basicTextSchema, generateRows } from '../mock-data'

createGridHost(
  withExcelHeaders({
    data: new InMemoryDataSource({
      schema: basicTextSchema(),
      rows: generateRows(basicTextSchema(), 80),
    }),
  }),
)
