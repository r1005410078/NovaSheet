import { Grid } from '@novasheet/web'
import { InMemoryDataSource } from '@novasheet/core'
import { createGridHost } from '../grid-host'

const host = createGridHost({ data /* 2000 行 */ })
requestAnimationFrame(() => {
  const grid = (host as HTMLElement & { __grid: Grid }).__grid
  grid.scrollToRow(500, 'center')
})
