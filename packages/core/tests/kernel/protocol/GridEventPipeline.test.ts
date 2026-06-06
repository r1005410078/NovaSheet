import { describe, expect, it } from 'bun:test'
import { GridEventPipeline } from '../../../src/kernel/protocol/GridEventPipeline'
import type { GridDomainEventHandler } from '../../../src/kernel/protocol/GridEventPipeline'

describe('GridEventPipeline', () => {
  it('dispatches domain events to fixed handlers in registration order', () => {
    const calls: string[] = []
    const handlers: readonly GridDomainEventHandler[] = [
      { handle: () => calls.push('selection') },
      { handle: () => calls.push('format') },
    ]
    const pipeline = new GridEventPipeline(handlers)

    pipeline.dispatch({
      kind: 'rowsMoved',
      rowIds: [1],
      beforeRowId: null,
      inverseRowIds: [0],
      inverseBeforeRowId: 1,
      indexMap: new Map([[1, 0]]),
    })

    expect(calls).toEqual(['selection', 'format'])
  })
})
