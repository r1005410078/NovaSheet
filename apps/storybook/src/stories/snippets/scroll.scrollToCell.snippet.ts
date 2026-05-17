import { Grid } from '@novasheet/web'
import { createGridHost } from '../grid-host'

const host = createGridHost({ data: wideData })
requestAnimationFrame(() => {
  const grid = (host as HTMLElement & { __grid: Grid }).__grid
  grid.scrollToCell(100, 'c20')
})
