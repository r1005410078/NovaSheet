import { Grid, type GridOptions } from '@novasheet/core'

/**
 * Creates a sized div, instantiates a Grid inside it, returns the div.
 * Caller (story) is responsible for returning this from its render function.
 */
export function createGridHost(opts: GridOptions, width = 780, height = 480): HTMLElement {
  const el = document.createElement('div')
  el.style.width = `${width}px`
  el.style.height = `${height}px`
  el.style.position = 'relative'
  new Grid(el, opts)
  return el
}
