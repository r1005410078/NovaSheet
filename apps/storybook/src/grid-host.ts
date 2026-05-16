import { Grid, type GridOptions } from '@novasheet/core'

/**
 * Creates a sized div, instantiates a Grid inside it, returns the div with the Grid
 * instance attached as `__grid` so stories can call imperative APIs (scrollToRow,
 * setTheme, etc.) and devtools can inspect it.
 */
export function createGridHost(
  opts: GridOptions,
  width = 780,
  height = 480,
): HTMLElement {
  const el = document.createElement('div')
  el.style.width = `${width}px`
  el.style.height = `${height}px`
  el.style.position = 'relative'
  const grid = new Grid(el, opts)
  ;(el as unknown as HTMLElement & { __grid: Grid }).__grid = grid
  return el
}
