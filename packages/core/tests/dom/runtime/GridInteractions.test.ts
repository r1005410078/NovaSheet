import { describe, expect, it } from 'bun:test'
import { resolveGridInteractions } from '../../../src/dom/runtime/GridInteractions'

describe('resolveGridInteractions', () => {
  it('defaults all interactions to enabled', () => {
    expect(resolveGridInteractions()).toEqual({
      contextMenu: true,
      resize: true,
      reorder: true,
    })
  })

  it('honors explicit false flags without changing unspecified ones', () => {
    expect(
      resolveGridInteractions({
        contextMenu: false,
        resize: false,
      }),
    ).toEqual({
      contextMenu: false,
      resize: false,
      reorder: true,
    })
  })

  it('can disable reorder alone', () => {
    expect(resolveGridInteractions({ reorder: false })).toEqual({
      contextMenu: true,
      resize: true,
      reorder: false,
    })
  })
})
