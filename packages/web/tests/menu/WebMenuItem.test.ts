import { describe, expect, it } from 'bun:test'
import { createSheetContext, type ContextMenuContext } from '@novasheet/core'
import {
  mergeMenuItems,
  registerWebMenuItem,
  getWebMenuItemContributions,
  type WebMenuItemProvider,
} from '../../src/menu/WebMenuItem'

describe('web.menu-item', () => {
  it('按 order 注册并 merge 去重 id（后者覆盖前者）', () => {
    const ctx = createSheetContext()
    const a: WebMenuItemProvider = {
      id: 'a',
      order: 10,
      getItems: () => [{ id: 'copy', label: 'A', disabled: false }],
    }
    const b: WebMenuItemProvider = {
      id: 'b',
      order: 20,
      getItems: () => [{ id: 'paste', label: 'B', disabled: false }],
    }
    registerWebMenuItem(ctx, b)
    registerWebMenuItem(ctx, a)
    const menuCtx = { targetKind: 'cell' } as ContextMenuContext
    const items = mergeMenuItems(
      getWebMenuItemContributions(ctx).map((p) => p.getItems(menuCtx, {})),
    )
    expect(items.map((i) => i.id)).toEqual(['copy', 'paste'])
    expect(items[0]?.label).toBe('A')
  })

  it('相同 id 时后者 label 覆盖前者', () => {
    const items = mergeMenuItems([
      [{ id: 'copy', label: 'old', disabled: false }],
      [{ id: 'copy', label: 'new', disabled: true }],
    ])
    expect(items).toEqual([{ id: 'copy', label: 'new', disabled: true }])
  })
})
