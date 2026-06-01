import type { SheetContext } from '@novasheet/core'

export function installBasicCells(ctx: SheetContext): void {
  ctx.extensions.cell('text', {})
  ctx.extensions.cell('number', {})
  ctx.extensions.cell('boolean', {})
  ctx.extensions.cell('date', {})
  ctx.extensions.cell('singleSelect', {})
  ctx.extensions.cell('multiSelect', {})
  ctx.extensions.cell('url', {})
}
