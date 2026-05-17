// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — storybook docs display snippet; references
import { InMemoryDataSource } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { basicTextSchema, generateRows } from '../mock-data'

const data = new InMemoryDataSource({
  schema: basicTextSchema(),
  rows: generateRows(basicTextSchema(), 200),
})

// 先点击表格，scroll-host 获得焦点后即可用键盘导航（无需额外 API）
createGridHost({ data })
