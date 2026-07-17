// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — storybook docs display snippet; references
import { Grid } from '@zhiguang/core'
import { createWrapAutofitBigDataSource } from '../mock-data'
import { createGridHost } from '../grid-host'

const rowCount = 10_000
const host = createGridHost({ data: createWrapAutofitBigDataSource(rowCount) })

requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    const grid = (host as HTMLElement & { __grid: Grid }).__grid
    const batchSize = 500
    let start = 0
    const runBatch = () => {
      const end = Math.min(start + batchSize, rowCount)
      grid.autofitRows({ rows: Array.from({ length: end - start }, (_, i) => start + i) })
      start = end
      if (start < rowCount) requestAnimationFrame(runBatch)
      else grid.scrollToRow(5000, 'center')
    }
    runBatch()
  })
})
