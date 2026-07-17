// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — storybook docs display snippet; references
import { Grid } from '@zhiguang/novasheet-core'
import { canvas2dBackend } from '@zhiguang/novasheet-canvas2d'
import { InMemoryDataSource, denseGridTheme } from '@zhiguang/novasheet-core'

const grid = new Grid(container, {
  backend: canvas2dBackend(),
  data: new InMemoryDataSource({ schema, rows }),
  theme: denseGridTheme,
  frozen: { topRows: 1, leftCols: 1, rightCols: 1 },
})

grid.scrollToCell(500, 'owner')
