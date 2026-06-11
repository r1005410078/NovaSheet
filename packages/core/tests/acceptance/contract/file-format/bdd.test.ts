import { describe, expect, it } from 'bun:test'

import {
  computePasteTarget,
  parseTsvToCells,
  pasteTargetConflictsWithMerges,
  serializeRowsToTsv,
  type Row,
  type Schema,
} from '../../../../src'
import { expectGolden } from '../../_helpers/golden'

describe('Core acceptance file format', () => {
it('core.L0.clipboard-tsv-roundtrip serializes and parses typed cells', () => {
    const tsvSchema: Schema = {
      fields: [
        { id: 'name', name: 'Name', type: 'text', width: 100 },
        { id: 'qty', name: 'Qty', type: 'number', width: 100 },
        { id: 'done', name: 'Done', type: 'checkbox', width: 80 },
      ],
    }
    const rows = [
      { name: 'apple', qty: 3, done: true },
      { name: 'banana', qty: null, done: false },
    ] satisfies Row[]
    const fieldIds = ['name', 'qty', 'done']
    const tsv = serializeRowsToTsv(rows, fieldIds)
    // TSV 本身是文本格式契约——serialize 输出入金（含制表符/空值的逐字节形态），parse 往返单独断言。
    expectGolden(import.meta.dir, 'core.L0.clipboard-tsv-roundtrip', `${tsv}\n`)
    expect(parseTsvToCells(tsv, fieldIds, tsvSchema)).toEqual([
      ['apple', 3, true],
      ['banana', null, false],
    ])
  })

  it('core.L0.clipboard-paste-target-merge-conflict rejects partial merge overlap', () => {
    const target = computePasteTarget(
      { rowIndex: 0, colIndex: 0 },
      { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
      1,
      1,
      { rowCount: 4, colCount: 4 },
    )
    if (target === null) throw new Error('expected paste target')
    const merges = [
      {
        id: 'merge-1',
        range: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
        anchor: { rowIndex: 0, colIndex: 0 },
      },
    ]
    expect(pasteTargetConflictsWithMerges(target, merges)).toBe(true)
  })
})
