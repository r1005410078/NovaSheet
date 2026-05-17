/**
 * Canvas2D 绘制层顺序。
 *
 * Phase 2 的目标是把“画什么”稳定拆成四层，后续选择、hover、resize handle
 * 都挂到对应层里，而不是继续塞进 Canvas2DRenderer 的主流程。
 */
export const CANVAS2D_PAINT_LAYERS = ['background', 'content', 'grid', 'overlay'] as const

export type Canvas2DPaintLayer = (typeof CANVAS2D_PAINT_LAYERS)[number]
