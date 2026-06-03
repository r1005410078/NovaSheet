import { describe, expect, it } from 'bun:test'
import { createSheetContext } from '@novasheet/core'
import { getWebMergeCellsContributions, registerWebMergeCells } from '../../src/merge-cells/WebMergeCells'

describe('web.merge-cells contribution', () => {
  it('registerWebMergeCells 按 order 排序', () => {
    const ctx = createSheetContext()
    registerWebMergeCells(ctx, { id: 'b', order: 20, create: () => null })
    registerWebMergeCells(ctx, { id: 'a', order: 10, create: () => null })
    expect(getWebMergeCellsContributions(ctx).map((c) => c.id)).toEqual(['a', 'b'])
  })
})
