import { describe, expect, it } from 'bun:test'
import { createSheetContext } from '@novasheet/core'
import { registerWebClipboard, getWebClipboardContributions } from '@novasheet/web'

describe('web.clipboard contribution', () => {
  it('注册并按 order 读取 clipboard 贡献', () => {
    const ctx = createSheetContext()
    registerWebClipboard(ctx, { id: 'b', order: 20, create: () => null })
    registerWebClipboard(ctx, { id: 'a', order: 10, create: () => null })
    expect(getWebClipboardContributions(ctx).map((c) => c.id)).toEqual(['a', 'b'])
  })
})
