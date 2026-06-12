/**
 * @novasheet/canvas2d——Canvas2D 渲染端实现。
 *
 * 本包导出渲染器 / 量度器 / surface 工具 + `canvas2dBackend` 工厂，由 core 的
 * 通用装配层经 `RenderBackendFactory` 端口注入。引擎与数据契约从 `@novasheet/core`
 * 导入；公共 `Grid` facade 在 `@novasheet/core`。
 */

export { Canvas2DRenderer } from './render/Canvas2DRenderer'
export type { Canvas2DRendererOptions } from './render/Canvas2DRenderer'
export { CANVAS2D_PAINT_LAYERS } from './render/PaintLayer'
export type { Canvas2DPaintLayer } from './render/PaintLayer'
export type {
  Canvas2DCellRenderParams,
  Canvas2DCellRenderer,
  Canvas2DCellRendererRegistry,
} from './painters/CellPainter'
export { HighDPI } from './surface/HighDPI'
export { Canvas2DTextMeasurer } from './measure/Canvas2DTextMeasurer'
export { canvas2dBackend } from './backend/canvas2dBackend'
