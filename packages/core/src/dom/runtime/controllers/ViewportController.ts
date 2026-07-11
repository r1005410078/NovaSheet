/**
 * ViewportController——DOM scroll↔逻辑坐标映射、host resize/DPR 合帧、spacer 尺寸与
 * 程序化滚动定位（GridRuntime 拆分 Task 2，见 `docs/superpowers/specs/2026-07-11-grid-runtime-decomposition-design.md` §3.2）。
 *
 * 自持 `ScrollMapper`（DOM scrollTop/scrollLeft ↔ engine 逻辑滚动坐标的换算，`SAFE_MAX` 语义不变）；
 * `FrameScheduler` 经 deps 注入（不变量 #6：一个 Grid 一个 scheduler，controller 不许自建）。
 */

import type { GridEngine } from '../../../engine/GridEngine'
import type { WebHost } from '../../host/Host'
import type { RenderBackend } from '../../../ports/RenderBackend'
import type { FrameScheduler } from '../../../kernel/util/raf'
import { ScrollMapper } from '../../scroll/ScrollMapper'
import type { NativeScrollSource } from '../../scroll/NativeScroller'
import type { CellAddress } from '../../../kernel/coords/SelectionTypes'
import { computeScrollReveal } from '../../../kernel/interaction/scrollCellIntoView'
import type { RuntimeRenderFrame } from '../runtime-frame'

/** ResizeObserver 高频回调合并 key（与 `renderer:flush` 分离，同帧内先 resize 再 scroll:read） */
const HOST_RESIZE_KEY = 'host:resize'

/** ViewportController 的窄依赖接口——只列它真正需要的 GridRuntime 能力。 */
export interface ViewportControllerDeps {
  readonly engine: GridEngine
  readonly host: WebHost
  readonly scheduler: Pick<FrameScheduler, 'schedule' | 'cancel'>
  isDestroyed(): boolean
  invalidate(): void
  paintSync(): void
  /** scheduleHostResize 内 renderer.resize 调用点；renderer 可被 replaceRenderer 替换，故经函数取最新值。 */
  getRenderer(): RenderBackend
  onSurfaceResize?(width: number, height: number, dpr: number): void
  /** handleHostScroll：setScroll 前（excel workspace 记录滚动来源）。 */
  beforeApplyScroll(source: NativeScrollSource | undefined): void
  /** handleHostScroll：setScroll 后、invalidate 前（关编辑器/同步 editor 位置/关菜单/藏 tooltip/excel 帧）。 */
  afterApplyScroll(): void
}

export class ViewportController {
  private readonly deps: ViewportControllerDeps
  /** DOM scroll 与逻辑 scroll 坐标之间的映射器。 */
  private readonly scrollMapper = new ScrollMapper()

  constructor(deps: ViewportControllerDeps) {
    this.deps = deps
  }

  /** 处理 host 滚动事件，映射为逻辑滚动并触发重绘。 */
  handleHostScroll(scrollTop: number, scrollLeft: number, source?: NativeScrollSource): void {
    const { logicalX, logicalY } = this.mapScrollToLogical(scrollTop, scrollLeft)
    this.deps.beforeApplyScroll(source)
    this.deps.engine.setScroll(logicalX, logicalY)
    this.deps.afterApplyScroll()
    this.deps.invalidate()
  }

  /** 处理 host 尺寸变化；实际 resize 工作合并到 RAF 中执行。 */
  handleHostResize(_cssWidth: number, _cssHeight: number, _dpr: number): void {
    void _cssWidth
    void _cssHeight
    void _dpr
    this.scheduleHostResize()
  }

  /** 处理 DPR 变化；实际 resize 工作合并到 RAF 中执行。 */
  handleHostDprChange(_dpr: number): void {
    void _dpr
    this.scheduleHostResize()
  }

  /** @internal 供集成测试模拟 ResizeObserver 回调 */
  onContainerResize(): void {
    const { width, height } = this.deps.host.getContainerSize()
    this.handleHostResize(width, height, this.deps.host.getDpr())
  }

  /**
   * 合并 ResizeObserver / DPR 变更：在同一 RAF 内完成 viewport、位图缩放与同步绘制。
   * 避免 HighDPI.resize 清空 canvas 后等到 `renderer:flush` 才画（中间空白帧会闪烁）。
   */
  scheduleHostResize(): void {
    if (this.deps.isDestroyed()) return
    this.deps.scheduler.schedule(HOST_RESIZE_KEY, () => {
      if (this.deps.isDestroyed()) return
      const { width, height } = this.deps.host.getContainerSize()
      const dpr = this.deps.host.getDpr()
      this.deps.engine.setViewportSize(width, height)
      this.deps.onSurfaceResize?.(width, height, dpr)
      this.deps.getRenderer().resize(width, height, dpr)
      this.remapScroll()
      this.deps.paintSync()
    })
  }

  /** 读取当前 DOM 滚动位置并同步到 engine 的逻辑 viewport。 */
  remapScroll(): void {
    const { scrollTop, scrollLeft } = this.deps.host.getScrollPosition()
    const { logicalX, logicalY } = this.mapScrollToLogical(scrollTop, scrollLeft)
    this.deps.engine.setScroll(logicalX, logicalY)
  }

  /** 按内容尺寸与 header 尺寸更新 host scroll spacer。 */
  resizeSpacer(): void {
    const headerH = this.deps.engine.getTheme().metrics.headerHeight
    const w = this.scrollMapper.computeSpacerSize(this.getColsContentWidth())
    const h = this.scrollMapper.computeSpacerSize(this.deps.engine.getRowsTotalSize() + headerH)
    this.deps.host.setScrollSize(w, h)
  }

  /** 计算当前 DOM scrollTop/scrollLeft 的最大边界。 */
  getScrollLimits(): { maxTop: number; maxLeft: number } {
    const headerH = this.deps.engine.getTheme().metrics.headerHeight
    const { width, height } = this.deps.host.getContainerSize()
    return {
      maxTop: Math.max(
        0,
        this.scrollMapper.computeSpacerSize(this.deps.engine.getRowsTotalSize() + headerH) - height,
      ),
      maxLeft: Math.max(0, this.scrollMapper.computeSpacerSize(this.getColsContentWidth()) - width),
    }
  }

  /**
   * 水平内容总宽 = 列总宽 + 行号 gutter。与垂直轴加 `headerH` 对称：
   * gutter（Excel 模式行号列）是固定不滚动的左侧偏移，必须计入 spacer/滚动数学，
   * 否则原生横向滚动条会比真实可滚列区短 gutter px（右缘缺口、最右列滚不到）。
   */
  getColsContentWidth(): number {
    return this.deps.engine.getColsTotalSize() + this.deps.engine.getViewport().getRowHeaderWidth()
  }

  getColsTotalSizeForFrame(frame: RuntimeRenderFrame): number {
    const axis = frame.colsAxis
    if (typeof axis.getTotalSize === 'function') return axis.getTotalSize()
    const engineTotal = this.deps.engine.getColsTotalSize()
    if (engineTotal > 0) return engineTotal
    const count = axis.getCount()
    if (count <= 0) return 0
    return axis.indexToPosition(count - 1) + axis.getSize(count - 1)
  }

  /** 滚动到指定行，并按给定对齐方式放入 viewport。 */
  scrollToRow(rowIndex: number, align: 'start' | 'center' | 'end' = 'start'): void {
    const rowsAxis = this.deps.engine.getRowsAxis()
    if (rowIndex < 0 || rowIndex >= rowsAxis.getCount()) return
    const top = rowsAxis.indexToPosition(rowIndex)
    const size = rowsAxis.getSize(rowIndex)
    const { height: clientH } = this.deps.host.getContainerSize()
    const vpContentH = clientH - this.deps.engine.getTheme().metrics.headerHeight
    let logicalY: number
    if (align === 'start') logicalY = top
    else if (align === 'end') logicalY = top + size - vpContentH
    else logicalY = top + size / 2 - vpContentH / 2

    const scrollTop = this.logicalToScrollY(logicalY)
    const { scrollLeft } = this.deps.host.getScrollPosition()
    this.deps.host.scrollTo(scrollTop, scrollLeft)
  }

  /** 滚动到指定单元格的左上角。 */
  scrollToCell(rowIndex: number, fieldId: string): void {
    const rowsAxis = this.deps.engine.getRowsAxis()
    const colsAxis = this.deps.engine.getColsAxis()
    const colIndex = this.deps.engine.getColumnIndex(fieldId)
    if (rowIndex < 0 || rowIndex >= rowsAxis.getCount()) return
    if (colIndex < 0) return

    const top = rowsAxis.indexToPosition(rowIndex)
    const left = colsAxis.indexToPosition(colIndex)
    const scrollTop = this.logicalToScrollY(top)
    const scrollLeft = this.logicalToScrollX(left)
    this.deps.host.scrollTo(scrollTop, scrollLeft)
  }

  /** 返回导航后需要滚动到可见区域的选区目标。 */
  getSelectionScrollTarget(): CellAddress | null {
    const selection = this.deps.engine.getSelection()
    return selection.extentCell ?? selection.activeCell
  }

  /** 确保指定单元格完整可见，必要时滚动 host。 */
  ensureCellVisible(cell: CellAddress): void {
    const frame = this.deps.engine.getFrame()
    const { width, height } = this.deps.host.getContainerSize()
    const { scrollTop, scrollLeft } = this.deps.host.getScrollPosition()
    const { logicalX, logicalY } = this.mapScrollToLogical(scrollTop, scrollLeft)

    const reveal = computeScrollReveal({
      rowIndex: cell.rowIndex,
      colIndex: cell.colIndex,
      rowsAxis: frame.rowsAxis,
      colsAxis: frame.colsAxis,
      scrollX: logicalX,
      scrollY: logicalY,
      viewportWidth: width,
      viewportHeight: height,
      headerHeight: frame.theme.metrics.headerHeight,
      rowHeaderWidth: frame.viewport.rowHeaderWidth,
    })
    if (!reveal) return

    const nextTop = this.logicalToScrollY(reveal.logicalY)
    const nextLeft = this.logicalToScrollX(reveal.logicalX)
    this.deps.host.scrollTo(nextTop, nextLeft)
    this.handleHostScroll(nextTop, nextLeft)
  }

  /** 将 DOM scrollTop/scrollLeft 映射为 engine 使用的逻辑 scroll 坐标。 */
  private mapScrollToLogical(
    scrollTop: number,
    scrollLeft: number,
  ): { logicalX: number; logicalY: number } {
    const headerH = this.deps.engine.getTheme().metrics.headerHeight
    const contentH = this.deps.engine.getRowsTotalSize()
    const contentW = this.getColsContentWidth()
    const spacerH = this.scrollMapper.computeSpacerSize(contentH + headerH)
    const spacerW = this.scrollMapper.computeSpacerSize(contentW)
    const { width: clientW, height: clientH } = this.deps.host.getContainerSize()
    return {
      logicalX: this.scrollMapper.scrollToLogical(scrollLeft, spacerW, contentW, clientW),
      logicalY: this.scrollMapper.scrollToLogical(scrollTop, spacerH, contentH + headerH, clientH),
    }
  }

  /** 将逻辑 Y 滚动坐标映射回 DOM scrollTop。 */
  private logicalToScrollY(logicalY: number): number {
    const headerH = this.deps.engine.getTheme().metrics.headerHeight
    const contentH = this.deps.engine.getRowsTotalSize()
    const spacerH = this.scrollMapper.computeSpacerSize(contentH + headerH)
    const { height: clientH } = this.deps.host.getContainerSize()
    return this.scrollMapper.logicalToScroll(logicalY, spacerH, contentH + headerH, clientH)
  }

  /** 将逻辑 X 滚动坐标映射回 DOM scrollLeft。 */
  private logicalToScrollX(logicalX: number): number {
    const contentW = this.getColsContentWidth()
    const spacerW = this.scrollMapper.computeSpacerSize(contentW)
    const { width: clientW } = this.deps.host.getContainerSize()
    return this.scrollMapper.logicalToScroll(logicalX, spacerW, contentW, clientW)
  }

  /** 取消 pending 的 host resize 合帧任务。 */
  destroy(): void {
    this.deps.scheduler.cancel(HOST_RESIZE_KEY)
  }
}
