import { describe, expect, it, mock } from 'bun:test'

import { composeGridCallback } from '../../src/excel/composeGridCallback'

describe('composeGridCallback', () => {
  it('invokes user callback before after hook', () => {
    const order: string[] = []
    const user = mock((value: number) => {
      order.push(`user:${value}`)
    })
    const after = mock(() => {
      order.push('after')
    })

    const callback = composeGridCallback(user, after)
    callback(42)

    expect(user).toHaveBeenCalledWith(42)
    expect(after).toHaveBeenCalled()
    expect(order).toEqual(['user:42', 'after'])
  })

  it('still invokes after hook when user callback is undefined', () => {
    const after = mock(() => {})

    const callback = composeGridCallback(undefined, after)
    callback()

    expect(after).toHaveBeenCalled()
  })

  it('passes through callback parameters', () => {
    const user = mock((_row: number, _label: string) => {})
    const after = mock(() => {})

    const callback = composeGridCallback(user, after)
    callback(7, 'rows')

    expect(user).toHaveBeenCalledWith(7, 'rows')
  })
})
