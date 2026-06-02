import type { SheetContext } from '@novasheet/core'
import { registerWebDrag } from '@novasheet/web'
import { FillHandleController } from './FillHandleController'

/** 安装填充柄能力（autofill 拖拽 + 预览 + commit + DOM 层）。 */
export function installFillHandleFeature(ctx: SheetContext): void {
  registerWebDrag(ctx, {
    id: 'fill-handle',
    order: 20,
    create: (deps) =>
      new FillHandleController({
        engine: deps.engine,
        host: deps.host,
        afterEngineMutation: deps.afterEngineMutation,
        autofitRows: deps.autofitRows,
        onFill: (event) => deps.onFill?.(event),
        closeContextMenu: deps.closeContextMenu,
        commitActiveEdit: deps.commitActiveEdit,
        requestAutoScroll: deps.requestAutoScroll,
        stopAutoScroll: deps.stopAutoScroll,
        isBlocked: deps.isBlocked,
      }),
  })
}
