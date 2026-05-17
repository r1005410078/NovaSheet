/**
 * 所有 Web 渲染后端的共享契约（Canvas2D / WebGL / WebGPU）。
 *
 * 实现分布在各包（如 `@novasheet/web-canvas2d`、未来 `@novasheet/web-webgl`）。
 * 只负责绘制表面生命周期；滚动与布局状态由 `WebGridRuntime` + `GridEngine` 管理。
 */

import type { RenderFrame } from '@novasheet/core'

export interface WebRenderer {
  /** 将绘制表面挂到容器（Canvas2D 过渡期可能仍为 no-op，由装配层创建 canvas）。 */
  mount(container: HTMLElement): void
  /** 按 CSS 尺寸与 DPR 调整绘制表面。 */
  resize(width: number, height: number, dpr: number): void
  /** 根据引擎快照绘制一帧（同步；调度由 `WebGridRuntime` 负责）。 */
  render(frame: RenderFrame): void
  destroy(): void
}
