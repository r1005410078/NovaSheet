/**
 * canvas2dBackend——Canvas2D `RenderBackendFactory` 实现。
 *
 * 把 Canvas2D 特有的 surface 生命周期（canvas 创建 / HighDPI / renderer 重建 /
 * 共享 measurer）封装为工厂，注入给 core 的通用装配层（`GridControllerImpl`），
 * 从而反转 core→canvas2d 的依赖：core 只依赖 `RenderBackendFactory` 端口。
 */

import type {
  RenderBackendDeps,
  RenderBackendHandle,
  RenderBackend,
  RenderBackendFactory,
  GridEngineFrameSource,
} from '@novasheet/core'
import type { Canvas2DCellRendererRegistry } from '../painters/CellPainter'
import { Canvas2DRenderer } from '../render/Canvas2DRenderer'
import { Canvas2DTextMeasurer } from '../measure/Canvas2DTextMeasurer'
import { HighDPI } from '../surface/HighDPI'

export interface Canvas2DBackendOptions {
  /** Canvas2D-only custom cell renderer registry. */
  readonly cellRenderers?: Canvas2DCellRendererRegistry
}

export function canvas2dBackend(options: Canvas2DBackendOptions = {}): RenderBackendFactory {
  return ({ container, engine, scheduler }: RenderBackendDeps): RenderBackendHandle => {
    const canvas = document.createElement('canvas')
    Object.assign(canvas.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      pointerEvents: 'none',
      zIndex: '0',
    })
    container.appendChild(canvas)

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('NovaSheet: 2d canvas context unavailable')

    const highDpi = new HighDPI(canvas, ctx)
    // 共享 measurer：CellPainter 绘制 wrap 字段 + runtime.autofitRows 度量复用同一 LRU 缓存。
    const measurer = new Canvas2DTextMeasurer()

    const createRenderer = (e: GridEngineFrameSource): RenderBackend =>
      new Canvas2DRenderer({
        ctx,
        data: e.getData(),
        viewport: e.getViewport(),
        rowsAxis: e.getRowsAxis(),
        colsAxis: e.getColsAxis(),
        theme: e.getTheme(),
        scheduler,
        measurer,
        cellRenderers: options.cellRenderers,
      })

    return {
      renderer: createRenderer(engine),
      measurer,
      createRenderer,
      resizeSurface: (w, h) => highDpi.resize(w, h),
      destroy: () => canvas.remove(),
    }
  }
}
