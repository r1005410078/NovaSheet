// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — storybook docs display snippet; references undefined demo names by design
import { Grid } from '@zhiguang/core'
import { canvas2dBackend } from '@zhiguang/canvas2d'
import { InMemoryDataSource, type Schema } from '@zhiguang/core'

const schema: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 120 },
    { id: 'team', name: 'Team', type: 'text', width: 120 },
  ],
}

const grid = new Grid(container, {
  backend: canvas2dBackend(),
  data: new InMemoryDataSource({ schema, rows }),
  onContextMenuAction: (action, ctx) => {
    console.log('action', action, 'cell', ctx.cell, 'range', ctx.selectedRange)
  },
})
