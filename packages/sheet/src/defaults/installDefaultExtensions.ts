import type { SheetContext } from '@novasheet/core'
import { installRowColumnReorder } from '@novasheet/feature-row-column-reorder'
import { installBasicCells } from './installBasicCells'

/** Install built-in NovaSheet capabilities for the default sheet assembly. */
export function installDefaultExtensions(ctx: SheetContext): void {
  installBasicCells(ctx)
  installRowColumnReorder(ctx)
}
