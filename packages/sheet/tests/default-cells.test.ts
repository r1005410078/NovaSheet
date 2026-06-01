import { describe, expect, it } from 'bun:test'
import { createSheetContext } from '@novasheet/core'
import { installDefaultExtensions } from '../src/defaults/installDefaultExtensions'

describe('default cell extensions', () => {
  it('registers built-in field types', () => {
    const ctx = createSheetContext()

    installDefaultExtensions(ctx)

    expect(ctx.registry.cells.has('text')).toBe(true)
    expect(ctx.registry.cells.has('number')).toBe(true)
    expect(ctx.registry.cells.has('url')).toBe(true)
  })
})
