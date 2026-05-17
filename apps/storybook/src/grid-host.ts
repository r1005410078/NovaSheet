import { Grid, type GridOptions } from '@novasheet/web'

/**
 * Creates a Grid-hosting div, instantiates a Grid inside it, returns the div with the
 * Grid instance attached as `__grid` so stories can call imperative APIs (scrollToRow,
 * setTheme, etc.) and devtools can inspect it.
 *
 * 默认填满 Storybook 画布（width/height = 100%）。容器尺寸变化时 Grid 的 ResizeObserver 会重算视口。
 * 仅在单测或需要固定 px 视口时传 number。
 */
export function createGridHost(
  opts: GridOptions,
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
  const grid = new Grid(el, opts)
  ;(el as unknown as HTMLElement & { __grid: Grid }).__grid = grid
  return el
}
