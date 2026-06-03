import type { SheetContext } from '@novasheet/core'
import { registerWebStructure } from '@novasheet/web'
import { StructureController } from './StructureController'
import { registerStructureMenuProviders } from './structureMenuProviders'

/** 安装行列结构操作（列头/行头 menu 项 + 结构动作）。 */
export function installStructureFeature(ctx: SheetContext): void {
  registerStructureMenuProviders(ctx)
  registerWebStructure(ctx, {
    id: 'structure',
    order: 10,
    create: (deps) => new StructureController(deps),
  })
}
