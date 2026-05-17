// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — storybook docs display snippet; references undefined demo names by design
import { Grid } from '@novasheet/web'
import { InMemoryDataSource, type Schema } from '@novasheet/core'

const schema: Schema = {
  fields: [
    { id: 'name', name: '姓名', type: 'text', width: 120 },
    { id: 'team', name: '团队', type: 'text', width: 120 },
  ],
}

const grid = new Grid(container, {
  data: new InMemoryDataSource({ schema, rows }),
  onContextMenuAction: (action, ctx) => {
    console.log('action', action, 'cell', ctx.cell, 'range', ctx.selectedRange)
  },
})

// Phase 4.1 引擎实现后挂上：grid.setClipboardReady(true) 让 Paste 变可用
