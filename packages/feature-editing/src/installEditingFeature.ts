import type { SheetContext } from '@novasheet/core'
import { registerWebCellEditor } from '@novasheet/web'
import { EditingController } from './EditingController'

/** 安装单元格编辑能力（DOM 编辑器 + 编辑生命周期 + 定位）。 */
export function installEditingFeature(ctx: SheetContext): void {
  registerWebCellEditor(ctx, {
    id: 'editing',
    order: 10,
    create: (deps) => new EditingController(deps),
  })
}
