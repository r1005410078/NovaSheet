import type { SheetContext } from '@novasheet/core'
import { registerWebContextMenu } from '@novasheet/web'
import { ContextMenuController } from './ContextMenuController'
import { registerDefaultMenuProviders } from './defaultMenuProviders'

/** 安装右键菜单能力（DOM layer + 打开/汇聚/派发）。 */
export function installContextMenuFeature(ctx: SheetContext): void {
  registerDefaultMenuProviders(ctx)
  registerWebContextMenu(ctx, {
    id: 'context-menu',
    order: 10,
    create: (deps) => new ContextMenuController(deps),
  })
}
