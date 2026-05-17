import type { DataSource, GridEngineOptions, Theme } from '@novasheet/core'

/**
 * 渲染后端对内契约（Canvas2D / 未来 WebGL 等）。
 *
 * `Grid` 门面只依赖本接口，不把 Canvas2D 装配细节暴露给调用方。
 * 新增后端时实现此接口，并在 `Grid` 构造函数的 `switch (renderer)` 中注册。
 */
export interface GridController {
  setData(data: DataSource): void
  setTheme(theme: Theme): void
  setRowHeight(rowIndex: number, height: number): void
  setColumnWidth(fieldId: string, width: number): void
  refresh(): void
  scrollToRow(rowIndex: number, align?: 'start' | 'center' | 'end'): void
  scrollToCell(rowIndex: number, fieldId: string): void
  destroy(): void
  /** @internal ResizeObserver 集成测试入口 */
  _onContainerResize(): void
}

export type { GridEngineOptions }
