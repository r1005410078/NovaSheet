/**
 * WebRenderer — shared contract for all web-platform renderers (Canvas2D,
 * WebGL, WebGPU). Implementations live in their own packages
 * (e.g. @novasheet/web-canvas2d, future @novasheet/web-webgl).
 */

import type { RenderFrame } from '@novasheet/core'

export interface WebRenderer {
  mount(container: HTMLElement): void
  resize(width: number, height: number, dpr: number): void
  render(frame: RenderFrame): void
  destroy(): void
}
