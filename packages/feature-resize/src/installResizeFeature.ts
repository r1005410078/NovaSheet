import type { SheetContext } from '@novasheet/core'
import { registerWebDrag } from '@novasheet/web'
import { ResizeDrag } from './ResizeDrag'

/** Install row and column resize drag into a SheetContext. */
export function installResizeFeature(ctx: SheetContext): void {
  registerWebDrag(ctx, {
    id: 'resize',
    order: 10,
    create: (deps) =>
      new ResizeDrag({
        engine: deps.engine,
        handleLayer: deps.handleLayer,
        afterEngineMutation: deps.afterEngineMutation,
      }),
  })
}
