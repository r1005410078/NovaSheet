import { describe, expect, it } from 'bun:test'

import { mountRecordingGrid } from '../../_helpers/fixtures'

describe('Core acceptance events', () => {
  it('core.L2.grid-events-on-off delivers and unsubscribes public events', () => {
    const { container, grid } = mountRecordingGrid()
    const sortEvents: unknown[] = []
    const undoEvents: unknown[] = []
    const redoEvents: unknown[] = []

    const offSort = grid.on('sortChange', (event) => sortEvents.push(event))
    grid.getSortLayer().setSpec({ fieldId: 'score', direction: 'asc' })
    offSort()
    grid.getSortLayer().setSpec({ fieldId: 'score', direction: 'desc' })

    const offUndo = grid.onUndo((event) => undoEvents.push(event.command.kind))
    const offRedo = grid.onRedo((event) => redoEvents.push(event.command.kind))
    const offFill = grid.onFill(() => {})

    grid.insertRows(1, 1)
    grid.undo()
    grid.redo()
    offUndo()
    offRedo()
    offFill()

    expect(sortEvents).toEqual([{ spec: { fieldId: 'score', direction: 'asc' } }])
    expect(undoEvents).toEqual(['insertRows'])
    expect(redoEvents).toEqual(['insertRows'])

    grid.destroy()
    document.body.removeChild(container)
  })
})
