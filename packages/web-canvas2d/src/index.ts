/**
 * @novasheet/web-canvas2d——Canvas2D 渲染端实现。
 *
 * 本包导出渲染器 / 量度器 / surface 工具，由 `@novasheet/web` 的 Canvas2DBackend
 * 装配。引擎与数据契约从 `@novasheet/core` 导入；公共 `Grid` facade 在 `@novasheet/web`。
 */

export { Canvas2DRenderer } from './render/Canvas2DRenderer'
export type { Canvas2DRendererOptions } from './render/Canvas2DRenderer'
export { CANVAS2D_PAINT_LAYERS } from './render/PaintLayer'
export type { Canvas2DPaintLayer } from './render/PaintLayer'
export { HighDPI } from './surface/HighDPI'
export { Canvas2DTextMeasurer } from './measure/Canvas2DTextMeasurer'
