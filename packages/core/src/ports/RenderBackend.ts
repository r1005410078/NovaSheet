/**
 * 所有渲染后端的共享契约（Canvas2D / WebGL / WebGPU）。
 *
 * 实现分布在各后端包（如 `@novasheet/canvas2d`、未来 `@novasheet/webgl`）。
 * 只负责绘制表面生命周期；滚动与布局状态由宿主编排层与 `GridEngine` 管理。
 */

import type { RenderFrame } from '../kernel/render/RenderFrame'

export interface RenderBackend {
  /** 将绘制表面挂到容器（Canvas2D 过渡期可能仍为 no-op，由装配层创建 canvas）。 */
  mount(container: HTMLElement): void
  /** 按 CSS 尺寸与 DPR 调整绘制表面。 */
  resize(width: number, height: number, dpr: number): void
  /** 根据引擎快照绘制一帧（同步；调度由宿主编排层负责）。 */
  render(frame: RenderFrame): void
  destroy(): void
}
