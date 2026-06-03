import {
  hitTestCell,
  isMutableDataSource,
  type ContextMenuAction,
  type ContextMenuContext,
  type ContextMenuItem,
  type Theme,
} from '@novasheet/core'
import {
  getWebMenuItemContributions,
  mergeMenuItems,
  type WebContextMenu,
  type WebContextMenuRuntimeDeps,
  type WebMenuItemProvider,
  type WebPointerEvent,
} from '@novasheet/web'
import { DomContextMenuLayer } from './DomContextMenuLayer'
import type { ContextMenuMenuItemDeps } from './defaultMenuProviders'

export class ContextMenuController implements WebContextMenu {
  private layer: DomContextMenuLayer | null = null

  constructor(private readonly deps: WebContextMenuRuntimeDeps) {}

  attach(container: HTMLElement): void {
    this.layer = new DomContextMenuLayer(container, {
      onSelect: (id) => this.handleAction(id),
      onClose: () => this.deps.focusScrollHost(),
    })
    this.layer.attach()
  }

  destroy(): void {
    this.layer?.destroy()
    this.layer = null
  }

  applyTheme(theme: Theme): void {
    this.layer?.applyTheme(theme)
  }

  close(): void {
    this.layer?.close()
  }

  isOpen(): boolean {
    return this.layer?.isOpen() ?? false
  }

  handleHostContextMenu(event: WebPointerEvent): void {
    if (!this.layer) return
    if (this.deps.isContextMenuBlocked()) return

    if (this.deps.engine.isCellEditing()) {
      this.deps.commitActiveEdit(false)
    }

    const frame = this.deps.engine.getFrame()
    const headerHeight = frame.theme.metrics.headerHeight
    if (event.y < headerHeight) {
      if (!this.deps.viewPipeline) return
      const fields = frame.data.getSchema().fields
      const rowHeaderWidth = frame.viewport.rowHeaderWidth ?? 0
      if (event.x < rowHeaderWidth) return
      const scrollX = frame.viewport.scrollX ?? 0
      const logicalX = event.x - rowHeaderWidth + scrollX
      if (logicalX < 0 || logicalX >= frame.colsAxis.getTotalSize()) return
      const colIndex = frame.colsAxis.positionToIndex(logicalX)
      if (colIndex < 0 || colIndex >= fields.length) return
      const field = fields[colIndex]
      if (!field) return
      const sel = this.deps.engine.getSelection().selectedRange
      const startCol = sel?.startCol ?? colIndex
      const endCol = sel?.endCol ?? colIndex
      const ctx: ContextMenuContext = {
        targetKind: 'columnHeader',
        field,
        colIndex,
        multiSelect: field.type === 'multiSelect',
        selectedColCount: endCol - startCol + 1,
        hasHiddenInSelection: this.deps.collectHiddenInViewColRange(startCol, endCol).length > 0,
      }
      const point = {
        clientX: event.clientX ?? event.x,
        clientY: event.clientY ?? event.y,
      }
      this.deps.recordMenuOpen(ctx, point)
      this.openMenu(point.clientX, point.clientY, ctx)
      return
    }

    const rowHeaderWidth = frame.viewport.rowHeaderWidth ?? 0
    if (rowHeaderWidth > 0 && event.x < rowHeaderWidth) {
      const scrollY = frame.viewport.scrollY ?? 0
      const logicalY = event.y - headerHeight + scrollY
      if (logicalY >= 0) {
        const rowIndex = frame.rowsAxis.positionToIndex(logicalY)
        const colCount = frame.data.getSchema().fields.length
        if (rowIndex >= 0 && rowIndex < frame.rowsAxis.getCount() && colCount > 0) {
          this.deps.engine.setSelection({
            activeCell: { rowIndex, colIndex: 0 },
            anchorCell: { rowIndex, colIndex: 0 },
            extentCell: { rowIndex, colIndex: colCount - 1 },
            selectedRange: {
              startRow: rowIndex,
              endRow: rowIndex,
              startCol: 0,
              endCol: colCount - 1,
            },
          })
          this.deps.afterEngineMutation()
          const ctx: ContextMenuContext = { targetKind: 'rowHeader', targetRowIndex: rowIndex }
          const point = {
            clientX: event.clientX ?? event.x,
            clientY: event.clientY ?? event.y,
          }
          this.deps.recordMenuOpen(ctx, point)
          this.openMenu(point.clientX, point.clientY, ctx)
        }
      }
      return
    }

    const hit = hitTestCell(frame, event)
    if (!hit) return
    if (hit.colIndex < 0 || hit.rowIndex < 0) return

    const selection = this.deps.engine.getSelection()
    const range = selection.selectedRange
    const inRange =
      range !== null &&
      hit.rowIndex >= range.startRow &&
      hit.rowIndex <= range.endRow &&
      hit.colIndex >= range.startCol &&
      hit.colIndex <= range.endCol
    if (!inRange) {
      this.deps.engine.selectCell(hit)
      this.deps.afterEngineMutation()
    }

    const newSelection = this.deps.engine.getSelection()
    const dataMutable = isMutableDataSource(this.deps.engine.getData())
    const ctx: ContextMenuContext = {
      targetKind: 'cell',
      cell: hit,
      selectedRange: newSelection.selectedRange,
      hasSelection: newSelection.activeCell !== null,
      clipboardReady: dataMutable,
    }
    const point = {
      clientX: event.clientX ?? event.x,
      clientY: event.clientY ?? event.y,
    }
    this.deps.recordMenuOpen(ctx, point)
    this.openMenu(point.clientX, point.clientY, ctx)
  }

  handleAction(id: ContextMenuAction): void {
    const ctx = this.deps.getLastMenuContext()
    if (ctx?.targetKind === 'rowHeader') {
      if (this.deps.handleRowHeaderMenuAction(id, ctx)) return
      return
    }
    if (ctx?.targetKind === 'columnHeader') {
      if (this.deps.handleColumnMenuAction(id, ctx)) return
      return
    }

    if (!ctx || ctx.targetKind !== 'cell') return

    if (this.deps.notifyContextMenuAction(id, ctx)) return

    if (this.deps.handleCellMenuAction(id, ctx)) return

    const menuDeps = this.createMenuItemDeps()
    for (const provider of getWebMenuItemContributions(this.deps.context)) {
      if (provider.handleAction?.(id, ctx, menuDeps)) return
    }
  }

  private openMenu(clientX: number, clientY: number, ctx: ContextMenuContext): void {
      const items = this.collectItems(ctx)
    this.layer?.open({ clientX, clientY, items })
  }

  private collectItems(ctx: ContextMenuContext): readonly ContextMenuItem[] {
    const menuDeps = this.createMenuItemDeps(this.deps.viewPipeline)
    return mergeMenuItems(
      getWebMenuItemContributions(this.deps.context).map((p: WebMenuItemProvider) =>
        p.getItems(ctx, menuDeps),
      ),
    )
  }

  private createMenuItemDeps(viewPipeline?: import('@novasheet/core').ViewPipeline): ContextMenuMenuItemDeps {
    return {
      viewPipeline,
      engine: this.deps.engine,
      collectHiddenInViewColRange: (startCol, endCol) =>
        this.deps.collectHiddenInViewColRange(startCol, endCol),
      hasContextMenuConsumer: () => this.deps.hasContextMenuConsumer(),
      clipboardCopy: () => this.deps.clipboardCopy(),
      clipboardCut: () => this.deps.clipboardCut(),
      clipboardPaste: () => this.deps.clipboardPaste(),
    }
  }
}
