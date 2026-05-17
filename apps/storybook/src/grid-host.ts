import { Grid, type GridOptions } from '@novasheet/core'

/**
 * Creates a Grid-hosting div, instantiates a Grid inside it, returns the div with the
 * Grid instance attached as `__grid` so stories can call imperative APIs (scrollToRow,
 * setTheme, etc.) and devtools can inspect it.
 *
 * 默认填满父容器（width/height = '100%'）——配合 preview.ts 的 fullscreen wrapper，
 * story 占据整个 iframe。若要固定尺寸（构造期 size 测试等），传 number 走 px。
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
  const grid = new Grid(el, opts)
  ;(el as unknown as HTMLElement & { __grid: Grid }).__grid = grid
  return el
}
