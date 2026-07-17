import { Grid, type GridOptions } from '@zhiguang/core'
import { canvas2dBackend } from '@zhiguang/canvas2d'

/**
 * Creates a Grid-hosting div, instantiates a Grid inside it, returns the div with the
 * Grid instance attached as `__grid` so stories can call imperative APIs (scrollToRow,
 * setTheme, etc.) and devtools can inspect it.
 *
 * Defaults to filling the Storybook canvas (width/height = 100%). Grid's
 * ResizeObserver recalculates the viewport when the container changes size.
 * Pass numbers only for tests or stories that need a fixed px viewport.
 */
export function createGridHost(
  opts: Omit<GridOptions, 'backend'>,
  width: number | string = '100%',
  height: number | string = '100%',
): HTMLElement {
  const el = document.createElement('div')
  el.style.width = typeof width === 'number' ? `${width}px` : width
  el.style.height = typeof height === 'number' ? `${height}px` : height
  el.style.position = 'relative'
  el.style.boxSizing = 'border-box'
  if (width === '100%' || height === '100%') {
    el.style.minHeight = '0'
  }
  const grid = new Grid(el, { backend: canvas2dBackend(), ...opts })
  ;(el as unknown as HTMLElement & { __grid: Grid }).__grid = grid
  return el
}
