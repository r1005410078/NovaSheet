import type { SheetContext } from '@novasheet/core'
import { registerWebMergeCells } from '@novasheet/web'
import { MergeCellsController } from './MergeCellsController'
import { registerMergeCellsMenuProvider } from './mergeCellsMenuProvider'

/** 安装合并单元格能力（单元格 menu 项 + merge/unmerge 动作）。 */
export function installMergeCellsFeature(ctx: SheetContext): void {
  registerMergeCellsMenuProvider(ctx)
  registerWebMergeCells(ctx, {
    id: 'merge-cells',
    order: 10,
    create: (deps) => new MergeCellsController(deps),
  })
}
