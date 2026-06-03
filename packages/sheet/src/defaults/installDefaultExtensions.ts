import type { SheetContext } from '@novasheet/core'
import { installFillHandleFeature } from '@novasheet/feature-fill-handle'
import { installRowColumnReorder } from '@novasheet/feature-row-column-reorder'
import { installResizeFeature } from '@novasheet/feature-resize'
import { installBasicCells } from './installBasicCells'

/** Install built-in NovaSheet capabilities for the default sheet assembly. */
export function installDefaultExtensions(ctx: SheetContext): void {
  installBasicCells(ctx)
  installResizeFeature(ctx)
  installFillHandleFeature(ctx)
  installRowColumnReorder(ctx)
}
