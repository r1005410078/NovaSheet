import type { SheetContext } from '@novasheet/core'
import { registerWebClipboard } from '@novasheet/web'
import { ClipboardController } from './ClipboardController'

/** 安装剪贴板能力（copy/cut/paste + typed-paste 缓存）。 */
export function installClipboardFeature(ctx: SheetContext): void {
  registerWebClipboard(ctx, {
    id: 'clipboard',
    order: 10,
    create: (deps) => new ClipboardController(deps),
  })
}
