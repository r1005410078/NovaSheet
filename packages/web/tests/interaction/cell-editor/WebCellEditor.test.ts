import { describe, expect, it } from 'bun:test'
import { createSheetContext } from '@novasheet/core'
import { registerWebCellEditor, getWebCellEditorContributions } from '@novasheet/web'

describe('web.cell-editor contribution', () => {
  it('注册并按 order 读取 cell-editor 贡献', () => {
    const ctx = createSheetContext()
    registerWebCellEditor(ctx, { id: 'b', order: 20, create: () => null })
    registerWebCellEditor(ctx, { id: 'a', order: 10, create: () => null })
    expect(getWebCellEditorContributions(ctx).map((c) => c.id)).toEqual(['a', 'b'])
  })
})
