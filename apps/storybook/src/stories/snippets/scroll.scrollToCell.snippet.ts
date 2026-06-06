// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — storybook docs display snippet; references
import { Grid } from '@novasheet/core'
import { createGridHost } from '../grid-host'

const host = createGridHost({ data: wideData })
requestAnimationFrame(() => {
  const grid = (host as HTMLElement & { __grid: Grid }).__grid
  grid.scrollToCell(100, 'c20')
})
