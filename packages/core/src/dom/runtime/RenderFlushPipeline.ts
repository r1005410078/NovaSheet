/**
 * RenderFlushPipeline——`invalidate`/`paintSync`/`getRenderFrame` 与 flush 期间的
 * `sync*` 扇出（GridRuntime 拆分 Task 3，见
 * `docs/superpowers/specs/2026-07-11-grid-runtime-decomposition-design.md` §3.4「flush 单帧」）。
 *
 * 固化 5cf2612 提交的性能不变量：一次 flush（`invalidate` 的 RAF 回调，或 `paintSync`
 * 的同步路径）只调用一次 `engine.getFrame()`，把同一个 frame 对象依次下传给
 * `renderer.render` → `syncSelectionOverlay` → `notifySelectionChange` →
 * `syncDomLayers`，禁止其中任何一环内部再次 `getFrame()`。
 */

import type { FrameScheduler } from '../../kernel/util/raf'
import type { RenderBackend } from '../../ports/RenderBackend'
import type { ViewPipeline } from '../../features/view/ViewPipeline'
import type { GridSelection } from '../../kernel/coords/SelectionTypes'
import type { RuntimeRenderFrame } from './runtime-frame'

/** RAF 合帧 key；与 GridRuntime 原实现一致（`scheduler.cancel` 依赖同一字符串）。 */
const RENDER_FLUSH_KEY = 'renderer:flush'

/** RenderFlushPipeline 的窄依赖接口——只列它真正需要的 GridRuntime 能力。 */
export interface RenderFlushPipelineDeps {
  readonly scheduler: Pick<FrameScheduler, 'schedule' | 'cancel'>
  isDestroyed(): boolean
  /** `() => engine.getFrame()`。 */
  getFrame(): RuntimeRenderFrame
  getRenderer(): RenderBackend
  getViewPipeline(): ViewPipeline | undefined
  /** edit 域 frame 增强（`activeCustomEditorCellEdit` 合并）；指向 `CellEditController.augmentFrame`（Task 7）。 */
  augmentFrame(frame: RuntimeRenderFrame): RuntimeRenderFrame
  syncSelectionOverlay(frame: RuntimeRenderFrame): void
  /** resize/fill/hideRow/hideCol handle + cellEditor 位置；runtime 组合闭包保持现顺序。 */
  syncDomLayers(frame: RuntimeRenderFrame): void
  getOnSelectionChange(): ((selection: GridSelection) => void) | undefined
  /** `notifySelectionChange` 在 `frame.selection` 缺省时的兜底（现实现防御性分支，`RenderFrame.selection` 为可选字段）。 */
  getSelection(): GridSelection
}

export class RenderFlushPipeline {
  private readonly deps: RenderFlushPipelineDeps
  /** 上次已通知的选区签名，避免重复触发。 */
  private lastSelectionChangeSignature = ''

  constructor(deps: RenderFlushPipelineDeps) {
    this.deps = deps
  }

  /** 调度下一帧 render flush，并同步 overlay 与编辑器位置。 */
  invalidate(): void {
    if (this.deps.isDestroyed()) return
    this.deps.scheduler.schedule(RENDER_FLUSH_KEY, () => {
      if (this.deps.isDestroyed()) return
      const frame = this.getRenderFrame()
      this.deps.getRenderer().render(frame)
      this.deps.syncSelectionOverlay(frame)
      this.notifySelectionChange(frame)
      this.deps.syncDomLayers(frame)
    })
  }

  /** 立即同步绘制一帧；用于 attach/resize 等不能等待异步 flush 的路径。 */
  paintSync(): void {
    const frame = this.getRenderFrame()
    this.deps.getRenderer().render(frame)
    this.deps.syncSelectionOverlay(frame)
    this.notifySelectionChange(frame)
    this.deps.syncDomLayers(frame)
  }

  /** 获取当前 render frame，并在 view pipeline 存在时注入视图映射。 */
  getRenderFrame(): RuntimeRenderFrame {
    const frame = this.deps.getFrame()
    const next = this.deps.augmentFrame(frame)
    const viewPipeline = this.deps.getViewPipeline()
    if (!viewPipeline) return next
    return { ...next, viewPipeline }
  }

  /** 取消 pending 的 render flush；`replaceRenderer` 只 cancel 不销毁 pipeline 时使用。 */
  cancelPending(): void {
    this.deps.scheduler.cancel(RENDER_FLUSH_KEY)
  }

  /** 幂等销毁：等价于 `cancelPending`（无额外内部状态需要清理）。 */
  destroy(): void {
    this.cancelPending()
  }

  /** 选区签名变化时通知外部（工具栏状态同步等）。 */
  private notifySelectionChange(frame: RuntimeRenderFrame): void {
    const onSelectionChange = this.deps.getOnSelectionChange()
    if (!onSelectionChange) return
    const selection = frame.selection ?? this.deps.getSelection()
    const signature = selectionChangeSignature(selection)
    if (signature === this.lastSelectionChangeSignature) return
    this.lastSelectionChangeSignature = signature
    onSelectionChange(selection)
  }
}

function selectionChangeSignature(selection: GridSelection): string {
  if (!selection.activeCell || !selection.selectedRange) return 'empty'
  const active = selection.activeCell
  const range = selection.selectedRange
  return `${active.rowIndex}:${active.colIndex}|${range.startRow}-${range.endRow},${range.startCol}-${range.endCol}`
}
