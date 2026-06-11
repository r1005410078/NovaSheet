import { describe, it } from 'bun:test'

import { assertSerializable } from '../../../helpers/undo-serialization'
import { singleCellSelection } from '../../_helpers/fixtures'

describe('Core acceptance undo', () => {
it('core.L0.undo-command-serialization roundtrips representative commands', () => {
    const selection = singleCellSelection(0, 0)
    assertSerializable({
      kind: 'editCell',
      rowIndex: 0,
      fieldId: 'name',
      before: 'Ada',
      after: 'Grace',
    })
    assertSerializable({
      kind: 'format',
      before: [],
      after: [
        {
          range: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
          patch: { fillColor: '#fff2cc' },
          order: 0,
        },
      ],
      selectionBefore: selection,
      selectionAfter: selection,
    })
  })
})
