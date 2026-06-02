import type { SheetContext } from '@novasheet/core'
import { registerWebDrag } from '@novasheet/web'
import { ColumnHeaderDrag } from './ColumnHeaderDrag'
import { RowHeaderDrag } from './RowHeaderDrag'

/** Install row and column header reorder drags into a SheetContext. */
export function installRowColumnReorder(ctx: SheetContext): void {
  registerWebDrag(ctx, {
    id: 'column-header-reorder',
    order: 20,
    create: (deps) =>
      new ColumnHeaderDrag({
        engine: deps.engine,
        host: deps.host,
        overlay: deps.columnReorderOverlay,
        refresh: deps.refresh,
        afterEngineMutation: deps.afterEngineMutation,
        closeContextMenu: deps.closeContextMenu,
        requestAutoScroll: deps.requestAutoScroll,
        stopAutoScroll: deps.stopAutoScroll,
        isBlocked: deps.isBlocked,
        hitTestColumnHeader: deps.hitTestColumnHeader,
        isWholeColumnSelection: deps.isWholeColumnSelection,
        selectWholeColumn: deps.selectWholeColumn,
        selectWholeColumnRange: deps.selectWholeColumnRange,
        getColsTotalSize: deps.getColsTotalSize,
      }),
  })

  registerWebDrag(ctx, {
    id: 'row-header-reorder',
    order: 30,
    create: (deps) =>
      new RowHeaderDrag({
        engine: deps.engine,
        host: deps.host,
        overlay: deps.rowReorderOverlay,
        refresh: deps.refresh,
        afterEngineMutation: deps.afterEngineMutation,
        closeContextMenu: deps.closeContextMenu,
        requestAutoScroll: deps.requestAutoScroll,
        stopAutoScroll: deps.stopAutoScroll,
        isBlocked: deps.isBlocked,
        hitTestRowHeader: deps.hitTestRowHeader,
        isWholeRowSelection: deps.isWholeRowSelection,
        selectWholeRowRange: deps.selectWholeRowRange,
      }),
  })
}
