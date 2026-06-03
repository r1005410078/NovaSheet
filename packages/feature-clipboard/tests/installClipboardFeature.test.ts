import { describe, expect, it } from 'bun:test'
import { createSheetContext } from '@novasheet/core'
import { getWebClipboardContributions } from '@novasheet/web'
import { installClipboardFeature } from '../src'

describe('installClipboardFeature', () => {
  it('注册 clipboard 贡献', () => {
    const ctx = createSheetContext()
    installClipboardFeature(ctx)
    expect(getWebClipboardContributions(ctx).map((c) => c.id)).toEqual(['clipboard'])
  })
})
