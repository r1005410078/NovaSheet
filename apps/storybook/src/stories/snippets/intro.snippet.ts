// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — storybook docs display snippet; references
import { Grid } from '@novasheet/sheet'
import { InMemoryDataSource, denseGridTheme } from '@novasheet/core'

const grid = new Grid(container, {
  data: new InMemoryDataSource({ schema, rows }),
  theme: denseGridTheme,
  frozen: { topRows: 1, leftCols: 1, rightCols: 1 },
})

grid.scrollToCell(500, 'owner')
