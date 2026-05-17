// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — storybook docs display snippet; references
import { Grid } from '@novasheet/web'
import { InMemoryDataSource } from '@novasheet/core'
import { wrapAutofitSampleRows, wrapAutofitSchema } from '../mock-data'
import { createGridHost } from '../grid-host'

const data = new InMemoryDataSource({
  schema: wrapAutofitSchema(),
  rows: wrapAutofitSampleRows(),
})
const host = createGridHost({ data }, 720, 420)
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    ;(host as HTMLElement & { __grid: Grid }).__grid.autofitRows()
  })
})
