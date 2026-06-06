import { describe, expect, it } from 'bun:test'
import {
  getColumnHeaderStructuralMenuItems,
  type ContextMenuAction,
} from '../../../src/features/context-menu/ContextMenuModel'

describe('getColumnHeaderStructuralMenuItems', () => {
  it('返回 5 项（无 hidden）+ 6 项（有 hidden）', () => {
    const noHidden = getColumnHeaderStructuralMenuItems(1, false)

    expect(noHidden.map((item) => item.id)).toEqual([
      'insert-col-left',
      'insert-col-right',
      'delete-cols',
      'hide-cols',
      'resize-column-width',
    ])

    const withHidden = getColumnHeaderStructuralMenuItems(1, true)
    expect(withHidden.map((item) => item.id)).toContain('unhide-cols')
  })

  it('label 含 N', () => {
    const items = getColumnHeaderStructuralMenuItems(3, false)
    expect(items.find((item) => item.id === 'insert-col-left')?.label).toContain('3')
  })
})

describe('ContextMenuAction 联合体含列 actions', () => {
  it('类型层接受列 action', () => {
    const a: ContextMenuAction = 'insert-col-left'
    const b: ContextMenuAction = 'insert-col-right'
    const c: ContextMenuAction = 'delete-cols'
    const d: ContextMenuAction = 'hide-cols'
    const e: ContextMenuAction = 'unhide-cols'
    const f: ContextMenuAction = 'resize-column-width'

    expect([a, b, c, d, e, f]).toHaveLength(6)
  })
})
