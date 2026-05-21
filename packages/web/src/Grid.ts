import type {
  CellRange,
  ContextMenuAction,
  ContextMenuContext,
  DataSource,
  FrozenConfig,
  GridEngineOptions,
  PasteSkippedCell,
  Theme,
} from '@novasheet/core'
import { Canvas2DBackend } from './backends/Canvas2DBackend'
import type {
  AutofitRowsOptions,
  AutofitRowsResult,
  FillEvent,
  GridController,
  RedoEvent,
  UndoEvent,
} from './grid/GridController'

/** 已支持的渲染后端；WebGL 待 `@novasheet/web-webgl` 接入后扩展。 */
export type GridRendererBackend = 'canvas2d'

export interface GridOptions extends GridEngineOptions {
  /** 渲染后端，默认 `'canvas2d'`。 */
  renderer?: GridRendererBackend
  /** Phase 4.0 — 右键菜单项被选中时触发；4.1 之后不传走默认引擎（grid.copy/cut/paste）。 */
  onContextMenuAction?: (action: ContextMenuAction, ctx: ContextMenuContext) => void
  /** Phase 4.1 — copy 完成（snapshot 已写剪贴板）。 */
  onCopy?: (range: CellRange) => void
  /** Phase 4.1 — cut 完成（已写剪贴板 + 原格已清）。 */
  onCut?: (range: CellRange) => void
  /** Phase 4.1 — paste 完成（target 范围已应用）。 */
  onPaste?: (target: CellRange) => void
  /** Phase 4.1 — 至少一格因类型不匹配 / read-only 被跳过时触发。 */
  onPasteSkipped?: (cells: readonly PasteSkippedCell[]) => void
  /** Phase 4.2 — undo 完成时触发,携带刚执行的 UndoCommand。 */
  onUndo?: (event: UndoEvent) => void
  /** Phase 4.2 — redo 完成时触发,携带刚执行的 UndoCommand。 */
  onRedo?: (event: RedoEvent) => void
  /** Phase 4.3 — fill handle 提交完成时触发。 */
  onFill?: (event: FillEvent) => void
}

/** 启用 Excel 风格列标（A/B/…）与左侧行号。 */
export function withExcelHeaders<T extends GridOptions>(options: T): T {
  return { ...options, excelHeaders: true }
}

/** 从门面选项中剥离非引擎字段，只把引擎参数传给 `DefaultGridEngine`。 */
function engineOptionsFrom(options: GridOptions): GridEngineOptions {
  const {
    renderer: _r,
    onContextMenuAction: _a,
    onCopy: _c,
    onCut: _x,
    onPaste: _v,
    onPasteSkipped: _s,
    onUndo: _u,
    onRedo: _y,
    onFill: _f,
    ...engineOptions
  } = options
  void _r
  void _a
  void _c
  void _x
  void _v
  void _s
  void _u
  void _y
  void _f
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
        this.delegate = new Canvas2DBackend(container, engineOptions, {
          onContextMenuAction: options.onContextMenuAction,
          onCopy: options.onCopy,
          onCut: options.onCut,
          onPaste: options.onPaste,
          onPasteSkipped: options.onPasteSkipped,
          onUndo: options.onUndo,
          onRedo: options.onRedo,
          onFill: options.onFill,
        })
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

  /**
   * 按当前列宽 + 文本内容批量重算 `field.wrap === true` 字段的行高（M3 autofit）。
   *
   * 手动 API——后续若改了列宽 / 数据 / 主题需要再次调用。性能：N 行 × K 个 wrap 列
   * × measurer 缓存命中的 wrapText 计算，典型 500 行 × 3 列 < 10ms。
   *
   * @example
   * ```ts
   * grid.autofitRows()                              // 全表
   * grid.autofitRows({ rows: [0, 1, 2, 3, 4] })     // 仅前 5 行
   * grid.autofitRows({ maxHeight: 200 })            // 限制单行最高 200px
   * ```
   */
  autofitRows(options?: AutofitRowsOptions): AutofitRowsResult {
    return this.delegate.autofitRows(options)
  }

  setClipboardReady(ready: boolean): void {
    this.delegate.setClipboardReady(ready)
  }

  openContextMenuAt(rowIndex: number, fieldId: string): void {
    this.delegate.openContextMenuAt(rowIndex, fieldId)
  }

  closeContextMenu(): void {
    this.delegate.closeContextMenu()
  }

  /** Phase 4.1 — 程序化触发；走与 menu / Ctrl+C 同一引擎。返回 true 表示动作成功（已写剪贴板 / 已应用写入）。 */
  copy(): Promise<boolean> {
    return this.delegate.copy()
  }

  cut(): Promise<boolean> {
    return this.delegate.cut()
  }

  paste(): Promise<boolean> {
    return this.delegate.paste()
  }

  undo(): void {
    this.delegate.undo()
  }

  redo(): void {
    this.delegate.redo()
  }

  canUndo(): boolean {
    return this.delegate.canUndo()
  }

  canRedo(): boolean {
    return this.delegate.canRedo()
  }

  onUndo(handler: (event: UndoEvent) => void): () => void {
    this.delegate.setOnUndo(handler)
    return () => this.delegate.setOnUndo(() => {})
  }

  onRedo(handler: (event: RedoEvent) => void): () => void {
    this.delegate.setOnRedo(handler)
    return () => this.delegate.setOnRedo(() => {})
  }

  onFill(handler: (event: FillEvent) => void): () => void {
    return this.delegate.onFill(handler)
  }

  destroy(): void {
    this.delegate.destroy()
  }

  /** @internal ResizeObserver 路径 — `Grid.test.ts` 使用 */
  _onContainerResize(): void {
    this.delegate._onContainerResize()
  }
}
