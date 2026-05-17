// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — storybook docs display snippet; references
import type { Grid } from '@novasheet/web'
import { createGridHost } from '../grid-host'

const host = createGridHost({ data /* 2000 行 */ })
requestAnimationFrame(() => {
  const grid = (host as HTMLElement & { __grid: Grid }).__grid
  grid.scrollToRow(500, 'center')
})
