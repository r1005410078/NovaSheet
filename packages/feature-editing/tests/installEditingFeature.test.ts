import { describe, expect, it } from 'bun:test'
import { createSheetContext } from '@novasheet/core'
import { getWebCellEditorContributions } from '@novasheet/web'
import { installEditingFeature } from '../src'

describe('installEditingFeature', () => {
  it('注册 editing cell-editor 贡献', () => {
    const ctx = createSheetContext()
    installEditingFeature(ctx)
    expect(getWebCellEditorContributions(ctx).map((c) => c.id)).toEqual(['editing'])
  })
})
