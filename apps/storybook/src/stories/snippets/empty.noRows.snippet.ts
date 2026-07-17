// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — storybook docs display snippet; references
import { InMemoryDataSource } from '@zhiguang/core'
import { createGridHost } from '../grid-host'
import { basicTextSchema } from '../mock-data'

const data = new InMemoryDataSource({
  schema: basicTextSchema(),
  rows: [],
})

createGridHost({ data })
