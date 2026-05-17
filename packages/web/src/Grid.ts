import type { DataSource, FrozenConfig, GridEngineOptions, Theme } from '@novasheet/core'
import { Canvas2DBackend } from './backends/Canvas2DBackend'
import type { GridController } from './grid/GridController'

/** 已支持的渲染后端；WebGL 待 `@novasheet/web-webgl` 接入后扩展。 */
export type GridRendererBackend = 'canvas2d'

export interface GridOptions extends GridEngineOptions {
  /** 渲染后端，默认 `'canvas2d'`。 */
  renderer?: GridRendererBackend
}

/** 从门面选项中剥离 `renderer`，只把引擎参数传给 `DefaultGridEngine`。 */
function engineOptionsFrom(options: GridOptions): GridEngineOptions {
  const { renderer: _backend, ...engineOptions } = options
  void _backend
  return engineOptions
}

/**
 * 浏览器端对外 Grid 门面（spec §7）。
 *
 * 按 `options.renderer` 选择后端实现（默认 Canvas2D），调用方只需
 * `import { Grid } from '@novasheet/web'`，不必依赖 `@novasheet/web-canvas2d`。
 * 公共 API 方法全部转发给当前后端的 `GridController` 实现。
 */
export class Grid {
  private readonly delegate: GridController

  constructor(container: HTMLElement, options: GridOptions) {
    const backend = options.renderer ?? 'canvas2d'
    const engineOptions = engineOptionsFrom(options)

    switch (backend) {
      case 'canvas2d':
        this.delegate = new Canvas2DBackend(container, engineOptions)
        break
      default:
        throw new Error(`NovaSheet: renderer "${backend as string}" is not implemented`)
    }
  }

  setData(data: DataSource): void {
    this.delegate.setData(data)
  }

  setTheme(theme: Theme): void {
    this.delegate.setTheme(theme)
  }

  setRowHeight(rowIndex: number, height: number): void {
    this.delegate.setRowHeight(rowIndex, height)
  }

  setColumnWidth(fieldId: string, width: number): void {
    this.delegate.setColumnWidth(fieldId, width)
  }

  setFrozen(config: Partial<FrozenConfig>): void
  setFrozen(rows: number, cols: number): void
  setFrozen(configOrRows: Partial<FrozenConfig> | number, cols = 0): void {
    if (typeof configOrRows === 'number') this.delegate.setFrozen(configOrRows, cols)
    else this.delegate.setFrozen(configOrRows)
  }

  refresh(): void {
    this.delegate.refresh()
  }

  scrollToRow(rowIndex: number, align?: 'start' | 'center' | 'end'): void {
    this.delegate.scrollToRow(rowIndex, align)
  }

  scrollToCell(rowIndex: number, fieldId: string): void {
    this.delegate.scrollToCell(rowIndex, fieldId)
  }

  destroy(): void {
    this.delegate.destroy()
  }

  /** @internal ResizeObserver 路径 — `Grid.test.ts` 使用 */
  _onContainerResize(): void {
    this.delegate._onContainerResize()
  }
}
