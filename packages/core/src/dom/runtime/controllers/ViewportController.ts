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
import type { ColumnGroupChild } from '../../../kernel/data/Schema'

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
    const headerH = this.deps.engine.getViewport().getHeaderHeight()
    const w = this.scrollMapper.computeSpacerSize(this.getColsContentWidth())
    const h = this.scrollMapper.computeSpacerSize(this.deps.engine.getRowsTotalSize() + headerH)
    this.deps.host.setScrollSize(w, h)
  }

  /** 计算当前 DOM scrollTop/scrollLeft 的最大边界。 */
  getScrollLimits(): { maxTop: number; maxLeft: number } {
    const headerH = this.deps.engine.getViewport().getHeaderHeight()
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
    const headerH = this.deps.engine.getViewport().getHeaderHeight()
    // 可滚区（中间行带）高 = 视口高 − 表头 − 顶冻结行高；`end/center` 必须按这个高度对齐，
    // 否则目标被顶冻结行盖住 topHeight px。垂直冻结约定见 logicalToScrollY 注释。
    const middleH = Math.max(0, clientH - headerH - this.frozenTopHeight())
    let middleScrollY: number
    if (align === 'start') middleScrollY = top
    else if (align === 'end') middleScrollY = top + size - middleH
    else middleScrollY = top + size / 2 - middleH / 2

    const scrollTop = this.logicalToScrollY(middleScrollY)
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
    // 横轴目标是绝对列坐标；左冻结列宽是中心可滚区的内容基准，须减去后再换算成 scrollLeft
    // （见 logicalToScrollX 注释）。纵轴无需类似修正（两轴冻结约定不同）。
    const scrollLeft = this.logicalToScrollX(left - this.frozenLeftWidth())
    this.deps.host.scrollTo(scrollTop, scrollLeft)
  }

  /**
   * 滚动到指定组的首个可见叶列，按 align 对齐横向视口（横轴镜像 `scrollToRow`：无条件滚动到
   * align 位置，不做"已可见则不动"判断——那是 `ensureCellVisible` 的语义，本方法不复用）。
   * 组不存在或组内叶列全隐藏则 no-op。
   */
  scrollToGroup(groupId: string, align: 'start' | 'center' | 'end' = 'start'): void {
    const fieldId = this.findFirstVisibleGroupLeafFieldId(groupId)
    if (fieldId === null) return

    const colsAxis = this.deps.engine.getColsAxis()
    const colIndex = this.deps.engine.getColumnIndex(fieldId)
    const left = colsAxis.indexToPosition(colIndex)
    const size = colsAxis.getSize(colIndex)
    const { width: clientW } = this.deps.host.getContainerSize()
    const gutter = this.deps.engine.getViewport().getRowHeaderWidth()
    const leftWidth = this.frozenLeftWidth()
    // 中心可滚区宽 = 视口宽 − gutter − 左右冻结列宽；`end/center` 按此宽对齐目标。
    const centerW = Math.max(0, clientW - gutter - leftWidth - this.frozenRightWidth())
    // centerScrollX 是目标在列内容坐标系中的绝对位置（中心区左缘应显示到的内容 x）。
    let centerScrollX: number
    if (align === 'start') centerScrollX = left
    else if (align === 'end') centerScrollX = left + size - centerW
    else centerScrollX = left + size / 2 - centerW / 2

    const scrollLeft = this.logicalToScrollX(centerScrollX - leftWidth)
    const { scrollTop } = this.deps.host.getScrollPosition()
    this.deps.host.scrollTo(scrollTop, scrollLeft)
  }

  /**
   * 组 id（含嵌套子组）在组树中的首个可见叶列 fieldId；组不存在或叶列全隐藏返回 null。
   * `getColumnIndex` 对隐藏 / 未知 fieldId 返回 -1（与 `DefaultGridEngine.selectColumnGroup`
   * 判定可见叶列同一约定），故直接复用该阈值而不新增 engine API。
   */
  private findFirstVisibleGroupLeafFieldId(groupId: string): string | null {
    const node = findGroupNode(this.deps.engine.getColumnGroups(), groupId)
    if (node === null) return null
    for (const fieldId of collectLeafFieldIds(node.children)) {
      if (this.deps.engine.getColumnIndex(fieldId) >= 0) return fieldId
    }
    return null
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

    const { leftCols, topRows } = this.deps.engine.getFrozenConfig()
    const leftWidth = this.frozenLeftWidth()
    const rightWidth = this.frozenRightWidth()
    const topHeight = this.frozenTopHeight()

    // computeScrollReveal 用 colsAxis/rowsAxis 的**绝对**格坐标做比较，故必须喂它绝对可视窗：
    //   - X：中心区绝对左缘 centerScrollX = leftWidth + vp.scrollX（镜像 FrozenRegions）；
    //        把 gutter 记为 gutter+leftWidth+rightWidth，reveal 的可视宽即中心区宽。
    //   - Y：中间行带绝对顶 middleScrollY = max(vp.scrollY, topHeight)；表头记为 header+topHeight。
    const reveal = computeScrollReveal({
      rowIndex: cell.rowIndex,
      colIndex: cell.colIndex,
      rowsAxis: frame.rowsAxis,
      colsAxis: frame.colsAxis,
      scrollX: leftWidth + logicalX,
      scrollY: Math.max(logicalY, topHeight),
      viewportWidth: width,
      viewportHeight: height,
      headerHeight: frame.viewport.headerHeight + topHeight,
      rowHeaderWidth: frame.viewport.rowHeaderWidth + leftWidth + rightWidth,
    })
    if (!reveal) return

    // 冻结区内的格恒可见——不为它滚动那一轴（否则会误滚到 0）。reveal.logicalX 为绝对
    // centerScrollX 目标，减 leftWidth 还原为 vp.scrollX；reveal.logicalY 直接就是 vp.scrollY。
    const nextVpX = cell.colIndex < leftCols ? logicalX : reveal.logicalX - leftWidth
    const nextVpY = cell.rowIndex < topRows ? logicalY : reveal.logicalY
    // 两轴都落回当前值——reveal 只因冻结区命中而非真需滚动，早退避免伪 scrollTo/afterApplyScroll。
    if (nextVpX === logicalX && nextVpY === logicalY) return
    const nextTop = this.logicalToScrollY(nextVpY)
    const nextLeft = this.logicalToScrollX(nextVpX)
    this.deps.host.scrollTo(nextTop, nextLeft)
    this.handleHostScroll(nextTop, nextLeft)
  }

  /** 将 DOM scrollTop/scrollLeft 映射为 engine 使用的逻辑 scroll 坐标。 */
  private mapScrollToLogical(
    scrollTop: number,
    scrollLeft: number,
  ): { logicalX: number; logicalY: number } {
    const headerH = this.deps.engine.getViewport().getHeaderHeight()
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

  /**
   * 将逻辑 Y 滚动坐标（vp.scrollY，即 engine.setScroll 存的值）映射回 DOM scrollTop。
   * 是 mapScrollToLogical 纵轴的纯逆运算，不做冻结偏移修正——纵轴冻结约定是
   * `middleScrollY = max(vp.scrollY, topHeight)`（FrozenRegions），即 vp.scrollY 本就是**绝对**
   * 内容 Y，滚动定位目标（top）直接等于 vp.scrollY，无需减 topHeight。切勿为「对称」给它加减
   * topHeight——那会把 scrollToRow('start') 打偏 topHeight px（已实测）。横轴不同，见 logicalToScrollX。
   */
  private logicalToScrollY(logicalY: number): number {
    const headerH = this.deps.engine.getViewport().getHeaderHeight()
    const contentH = this.deps.engine.getRowsTotalSize()
    const spacerH = this.scrollMapper.computeSpacerSize(contentH + headerH)
    const { height: clientH } = this.deps.host.getContainerSize()
    return this.scrollMapper.logicalToScroll(logicalY, spacerH, contentH + headerH, clientH)
  }

  /**
   * 将逻辑 X 滚动坐标（vp.scrollX）映射回 DOM scrollLeft。是 mapScrollToLogical 横轴的纯逆运算。
   * 注意：横轴冻结约定是 `centerScrollX = leftWidth + vp.scrollX`（FrozenRegions），故 vp.scrollX 是
   * **中心区相对**坐标，而非绝对列坐标。调用方（scrollToCell/scrollToGroup/ensureCellVisible）持有的
   * 是绝对列坐标，必须先 `− leftWidth` 转成 vp.scrollX 再传入。此处不内嵌该减法，保持本函数为
   * 纯逆运算，与纵轴 logicalToScrollY 对称。
   */
  private logicalToScrollX(logicalX: number): number {
    const contentW = this.getColsContentWidth()
    const spacerW = this.scrollMapper.computeSpacerSize(contentW)
    const { width: clientW } = this.deps.host.getContainerSize()
    return this.scrollMapper.logicalToScroll(logicalX, spacerW, contentW, clientW)
  }

  /**
   * 左冻结列累计像素宽——中心可滚区在列内容坐标系中的基准偏移，等同 FrozenRegions 里
   * `centerScrollX = leftWidth + vp.scrollX` 的 leftWidth。无左冻结列返回 0。
   */
  private frozenLeftWidth(): number {
    const { leftCols } = this.deps.engine.getFrozenConfig()
    if (leftCols <= 0) return 0
    const colsAxis = this.deps.engine.getColsAxis()
    if (leftCols >= colsAxis.getCount()) return this.deps.engine.getColsTotalSize()
    return colsAxis.indexToPosition(leftCols)
  }

  /** 右冻结列累计像素宽；无右冻结列返回 0。 */
  private frozenRightWidth(): number {
    const { rightCols } = this.deps.engine.getFrozenConfig()
    if (rightCols <= 0) return 0
    const colsAxis = this.deps.engine.getColsAxis()
    const count = colsAxis.getCount()
    if (rightCols >= count) return this.deps.engine.getColsTotalSize()
    return this.deps.engine.getColsTotalSize() - colsAxis.indexToPosition(count - rightCols)
  }

  /** 顶冻结行累计像素高；无顶冻结行返回 0。 */
  private frozenTopHeight(): number {
    const { topRows } = this.deps.engine.getFrozenConfig()
    if (topRows <= 0) return 0
    const rowsAxis = this.deps.engine.getRowsAxis()
    if (topRows >= rowsAxis.getCount()) return this.deps.engine.getRowsTotalSize()
    return rowsAxis.indexToPosition(topRows)
  }

  /** 取消 pending 的 host resize 合帧任务。 */
  destroy(): void {
    this.deps.scheduler.cancel(HOST_RESIZE_KEY)
  }
}

/**
 * 深度优先查找 id 为 groupId 的组节点（含嵌套子组）。镜像
 * `features/column-groups/ColumnGroupStore.ts` 内部同名私有算法——两处均为组树只读遍历，
 * 该 store 未对外暴露此查找，DOM 层按 fieldId 可见性自解析更简单，故不新增 engine API。
 */
function findGroupNode(
  nodes: readonly ColumnGroupChild[],
  groupId: string,
): Extract<ColumnGroupChild, { id: string }> | null {
  for (const node of nodes) {
    if ('fieldId' in node) continue
    if (node.id === groupId) return node
    const found = findGroupNode(node.children, groupId)
    if (found) return found
  }
  return null
}

/** 收集子树内全部叶字段 id（文档序）。 */
function collectLeafFieldIds(nodes: readonly ColumnGroupChild[]): string[] {
  const result: string[] = []
  for (const node of nodes) {
    if ('fieldId' in node) result.push(node.fieldId)
    else result.push(...collectLeafFieldIds(node.children))
  }
  return result
}
