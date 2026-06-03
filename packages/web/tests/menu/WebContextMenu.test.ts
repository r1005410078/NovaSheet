import { describe, expect, it } from 'bun:test'
import { createSheetContext } from '@novasheet/core'
import { registerWebContextMenu, getWebContextMenuContributions } from '../../src/menu/WebContextMenu'

describe('web.context-menu contribution', () => {
  it('registerWebContextMenu 按 order 排序', () => {
    const ctx = createSheetContext()
    registerWebContextMenu(ctx, { id: 'b', order: 20, create: () => null })
    registerWebContextMenu(ctx, { id: 'a', order: 10, create: () => null })
    expect(getWebContextMenuContributions(ctx).map((c) => c.id)).toEqual(['a', 'b'])
  })
})
