/**
 * Canvas2DBackend——`Grid` facade 在 `renderer: 'canvas2d'` 时使用的后端实现。
 *
 * 把 `DefaultGridEngine` + `DomGridHost` + `Canvas2DRenderer` + `WebGridRuntime`
 * 装配成一个 `GridController`，对外暴露公共 API。其他渲染器（WebGL/WebGPU）
 * 实现各自的 `Backend` 即可，`Grid` 选择器根据 options 切换。
 *
 * 不变量：
 *   - 单实例只有一个 canvas、一个 host、一个 runtime
 *   - canvas 由 backend 拥有（renderer 不再自己 mount canvas，方便后端切换）
 *   - `setData` 时换 renderer（轴 / viewport 重建后旧 renderer 引用已失效）
 */

import {
  DefaultGridEngine,
  FrameScheduler,
  type ContextMenuAction,
  type ContextMenuContext,
  type DataSource,
  type FrozenConfig,
  type GridEngineOptions,
  type Theme,
} from '@novasheet/core'
import { Canvas2DRenderer, Canvas2DTextMeasurer, HighDPI } from '@novasheet/web-canvas2d'
import type {
  AutofitRowsOptions,
  AutofitRowsResult,
  GridController,
} from '../grid/GridController'
import { DomGridHost } from '../host/DomGridHost'
import { DomCellEditor } from '../interaction/DomCellEditor'
import { DomContextMenuLayer } from '../interaction/DomContextMenuLayer'
import { DomHandleLayer } from '../interaction/DomHandleLayer'
import { WebGridRuntime } from '../runtime/WebGridRuntime'

/**
 * Canvas2D 渲染后端装配（`Grid` 在 `renderer: 'canvas2d'` 时使用）。
 *
 * 职责划分：
 *   - 本类：创建 canvas / HighDPI / `Canvas2DRenderer`，并交给 `WebGridRuntime` 编排
 *   - `DomGridHost`：scrollHost、spacer、ResizeObserver、DPR 监听
 *   - `WebGridRuntime`：滚动映射、spacer 尺寸、RAF、`setData` 换 renderer
 *   - `DefaultGridEngine`（core）：数据、轴、viewport 逻辑状态
 *
 * Host 回调在 `attach()` 之后才触发，故可在 `this.runtime` 赋值后安全闭包引用。
 */
export class Canvas2DBackend implements GridController {
  private container: HTMLElement
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private engine: DefaultGridEngine
  private highDpi: HighDPI
  private renderer: Canvas2DRenderer
  private host: DomGridHost
  private handleLayer: DomHandleLayer
  private cellEditor: DomCellEditor
  private contextMenuLayer!: DomContextMenuLayer
  private runtime!: WebGridRuntime
  private scheduler = new FrameScheduler()
  /** 共享 measurer：CellPainter 绘制 wrap 字段 + runtime.autofitRows 度量都使用同一个实例，
   *  让 LRU 缓存跨绘制 / 度量复用。 */
  private measurer = new Canvas2DTextMeasurer()

  constructor(
    container: HTMLElement,
    options: GridEngineOptions,
    gridOptions?: {
      onContextMenuAction?: (action: ContextMenuAction, ctx: ContextMenuContext) => void
    },
  ) {
    this.container = container
    this.engine = new DefaultGridEngine(options)

    this.canvas = document.createElement('canvas')
    Object.assign(this.canvas.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      pointerEvents: 'none',
      zIndex: '0',
    })
    this.container.appendChild(this.canvas)

    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('NovaSheet: 2d canvas context unavailable')
    this.ctx = ctx

    this.highDpi = new HighDPI(this.canvas, this.ctx)
    this.renderer = this.createRenderer()

    this.handleLayer = new DomHandleLayer(this.container, {
      onResizePointerDown: (handle, pointerId, x, y) =>
        this.runtime.handleResizePointerDown(handle, pointerId, x, y),
      onResizePointerMove: (pointerId, x, y) =>
        this.runtime.handleResizePointerMove(pointerId, x, y),
      onResizePointerUp: (pointerId) => this.runtime.handleResizePointerUp(pointerId),
      onResizeKeyboard: (handle, delta) => this.runtime.handleResizeKeyboard(handle, delta),
    })
    this.handleLayer.attach()

    this.host = new DomGridHost({
      container: this.container,
      scheduler: this.scheduler,
      onScroll: (scrollTop, scrollLeft) =>
        this.runtime.handleHostScroll(scrollTop, scrollLeft),
      onResize: (w, h, dpr) => this.runtime.handleHostResize(w, h, dpr),
      onDprChange: (dpr) => this.runtime.handleHostDprChange(dpr),
      onPointerDown: (event) => this.runtime.handleHostPointerDown(event),
      onPointerMove: (event) => this.runtime.handleHostPointerMove(event),
      onPointerUp: () => this.runtime.handleHostPointerUp(),
      onKeyDown: (event) => this.runtime.handleHostKeyDown(event),
      onDoubleClick: (event) => this.runtime.handleHostDoubleClick(event),
      onContextMenu: (event) => this.runtime.handleHostContextMenu(event),
    })

    this.runtime = new WebGridRuntime({
      engine: this.engine,
      host: this.host,
      renderer: this.renderer,
      scheduler: this.scheduler,
      measurer: this.measurer,
      handleLayer: this.handleLayer,
      onSurfaceResize: (w, h) => this.highDpi.resize(w, h),
    })

    this.cellEditor = new DomCellEditor(this.container, {
      onDraftChange: (draft) => this.runtime.handleCellEditDraft(draft),
      onCommitEnter: () => this.runtime.handleCellEditCommitEnter(),
      onCommitBlur: () => this.runtime.handleCellEditCommitBlur(),
      onCancel: () => this.runtime.handleCellEditCancel(),
    })
    this.cellEditor.attach()
    this.runtime.setCellEditor(this.cellEditor)

    this.contextMenuLayer = new DomContextMenuLayer(this.container, {
      onSelect: (id) => this.runtime.handleContextMenuSelected(id),
    })
    this.contextMenuLayer.attach()
    this.runtime.setContextMenuLayer(this.contextMenuLayer)
    if (gridOptions?.onContextMenuAction) {
      this.runtime.setOnContextMenuAction(gridOptions.onContextMenuAction)
    }

    this.runtime.attach()
  }

  setData(data: DataSource): void {
    this.renderer = this.runtime.setData(data, () => this.createRenderer()) as Canvas2DRenderer
  }

  setTheme(theme: Theme): void {
    this.runtime.setTheme(theme, (renderer) => {
      (renderer as Canvas2DRenderer).setTheme(theme)
    })
    // 字体可能随主题变；清空 measurer 缓存避免过期宽度
    this.measurer.clearCache()
  }

  setRowHeight(rowIndex: number, height: number): void {
    this.runtime.setRowHeight(rowIndex, height)
  }

  setColumnWidth(fieldId: string, width: number): void {
    this.runtime.setColumnWidth(fieldId, width)
  }

  setFrozen(config: Partial<FrozenConfig>): void
  setFrozen(rows: number, cols: number): void
  setFrozen(configOrRows: Partial<FrozenConfig> | number, cols = 0): void {
    if (typeof configOrRows === 'number') this.runtime.setFrozen(configOrRows, cols)
    else this.runtime.setFrozen(configOrRows)
  }

  refresh(): void {
    this.runtime.refresh()
  }

  scrollToRow(rowIndex: number, align?: 'start' | 'center' | 'end'): void {
    this.runtime.scrollToRow(rowIndex, align)
  }

  scrollToCell(rowIndex: number, fieldId: string): void {
    this.runtime.scrollToCell(rowIndex, fieldId)
  }

  autofitRows(options: AutofitRowsOptions = {}): AutofitRowsResult {
    return this.runtime.autofitRows(options)
  }

  setClipboardReady(ready: boolean): void {
    this.runtime.setClipboardReady(ready)
  }

  openContextMenuAt(rowIndex: number, fieldId: string): void {
    this.runtime.openContextMenuAt(rowIndex, fieldId)
  }

  closeContextMenu(): void {
    this.runtime.closeContextMenu()
  }

  destroy(): void {
    this.contextMenuLayer.destroy()
    this.runtime.destroy()
    this.handleLayer.destroy()
    this.cellEditor.destroy()
    if (this.canvas.parentNode === this.container) {
      this.container.removeChild(this.canvas)
    }
  }

  _onContainerResize(): void {
    this.runtime.onContainerResize()
  }

  /** 用当前 engine 状态构造新的 `Canvas2DRenderer`（`setData` 后轴/viewport 会重建）。 */
  private createRenderer(): Canvas2DRenderer {
    return new Canvas2DRenderer({
      ctx: this.ctx,
      data: this.engine.getData(),
      viewport: this.engine.getViewport(),
      rowsAxis: this.engine.getRowsAxis(),
      colsAxis: this.engine.getColsAxis(),
      theme: this.engine.getTheme(),
      scheduler: this.scheduler,
      measurer: this.measurer,
    })
  }
}
