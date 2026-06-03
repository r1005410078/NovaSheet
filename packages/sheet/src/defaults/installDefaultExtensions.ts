import type { SheetContext } from '@novasheet/core'
import { installClipboardFeature } from '@novasheet/feature-clipboard'
import { installContextMenuFeature } from '@novasheet/feature-context-menu'
import { installSortFilterFeature } from '@novasheet/feature-sort-filter'
import { installStructureFeature } from '@novasheet/feature-structure'
import { installMergeCellsFeature } from '@novasheet/feature-merge-cells'
import { installEditingFeature } from '@novasheet/feature-editing'
import { installFillHandleFeature } from '@novasheet/feature-fill-handle'
import { installRowColumnReorder } from '@novasheet/feature-row-column-reorder'
import { installResizeFeature } from '@novasheet/feature-resize'
import { installBasicCells } from './installBasicCells'

/** Install built-in NovaSheet capabilities for the default sheet assembly. */
export function installDefaultExtensions(ctx: SheetContext): void {
  installBasicCells(ctx)
  installSortFilterFeature(ctx)
  installStructureFeature(ctx)
  installMergeCellsFeature(ctx)
  installContextMenuFeature(ctx)
  installResizeFeature(ctx)
  installEditingFeature(ctx)
  installClipboardFeature(ctx)
  installFillHandleFeature(ctx)
  installRowColumnReorder(ctx)
}
