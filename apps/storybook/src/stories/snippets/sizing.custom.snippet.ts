// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — storybook docs display snippet; references
import type { Grid } from '@zhiguang/core'
import { InMemoryDataSource, type Schema } from '@zhiguang/core'
import { createGridHost } from '../grid-host'
import { generateRows } from '../mock-data'

const schema: Schema = {
  fields: [
    { id: 'tiny', name: 'Tiny', type: 'text', width: 60 },
    { id: 'medium', name: 'Medium', type: 'text', width: 140 },
    { id: 'wide', name: 'Wide', type: 'text', width: 320 },
    { id: 'count', name: 'Count', type: 'number', width: 90 },
  ],
}
const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 60) })

const host = createGridHost({ data })
const grid = (host as HTMLElement & { __grid: Grid }).__grid
grid.setRowHeight(0, 56)
grid.setRowHeight(1, 40)
grid.setRowHeight(2, 20)
