/**
 * 所有渲染后端的共享契约（Canvas2D / WebGL / WebGPU）。
 *
 * 实现分布在各后端包（如 `@zhiguang/canvas2d`、未来 `@zhiguang/webgl`）。
 * 只负责绘制表面生命周期；滚动与布局状态由宿主编排层与 `GridEngine` 管理。
 */

import type { RenderFrame } from '../kernel/render/RenderFrame'
import type { GridEngine } from '../engine/GridEngine'
import type { FrameScheduler } from '../kernel/util/raf'
import type { TextMeasurer } from '../kernel/measure/TextMeasurer'
import type { Theme } from '../kernel/theme/Theme'
import type { DataSource } from '../kernel/data/DataSource'

export interface CellActionHit {
  readonly rowIndex: number
  readonly colIndex: number
  readonly actionId: string
}

export interface RenderBackend {
  /** 将绘制表面挂到容器（Canvas2D 过渡期可能仍为 no-op，由装配层创建 canvas）。 */
  mount(container: HTMLElement): void
  /** 按 CSS 尺寸与 DPR 调整绘制表面。 */
  resize(width: number, height: number, dpr: number): void
  /** 根据引擎快照绘制一帧（同步；调度由宿主编排层负责）。 */
  render(frame: RenderFrame): void
  /**
   * 主题变更时同步后端持有的可变引用（持有 theme 的后端实现；纯 frame 驱动的后端可不实现）。
   */
  setTheme?(theme: Theme): void
  /**
   * 数据源变更时同步后端持有的可变引用（持有 data 的后端实现；纯 frame 驱动的后端可不实现）。
   */
  setData?(data: DataSource): void
  /** 返回给定 canvas/client 坐标下的单元格 action；未命中返回 null。 */
  getCellActionAt?(x: number, y: number): CellActionHit | null
  destroy(): void
}

/** 渲染后端工厂可见的最窄 engine 只读面（帧装配所需 getter）。 */
export type GridEngineFrameSource = Pick<
  GridEngine,
  'getData' | 'getViewport' | 'getRowsAxis' | 'getColsAxis' | 'getTheme'
>

/** 后端工厂构造时的纯依赖（core 装配层提供）。 */
export interface RenderBackendDeps {
  readonly container: HTMLElement
  readonly engine: GridEngineFrameSource
  readonly scheduler: FrameScheduler
}

/** 后端工厂返回给装配层的句柄：渲染器 + 共享 measurer + 重建/尺寸钩子。 */
export interface RenderBackendHandle {
  readonly renderer: RenderBackend
  readonly measurer: TextMeasurer
  /** setData 后按当前 engine 重建渲染器。 */
  createRenderer(engine: GridEngineFrameSource): RenderBackend
  /** CSS 尺寸变化时同步绘制表面（= 原 highDpi.resize）。DPR 由后端实现自行读取（`window.devicePixelRatio`），调用方只传 CSS 尺寸。 */
  resizeSurface(width: number, height: number): void
  destroy(): void
}

/**
 * 渲染后端工厂端口。各后端包（canvas2d/webgl/...）导出其实现；
 * core 装配层经依赖注入消费，从而反转 core→backend 的依赖方向。
 */
export type RenderBackendFactory = (deps: RenderBackendDeps) => RenderBackendHandle
