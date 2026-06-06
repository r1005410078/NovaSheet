import { describe, expect, it } from 'bun:test'
import type { DataSource } from '../../src/kernel/data/DataSource'
import { findViewRow, resolveUnderlyingRow } from '../../src/view/coordinates'

const identitySource: DataSource = {
  getRowCount: () => 3,
  getSchema: () => ({ fields: [] }),
  getRows: () => [],
  getCell: () => undefined,
  subscribe: () => () => {},
}

describe('view coordinates helpers', () => {
  it('falls back to identity for undecorated sources', () => {
    expect(resolveUnderlyingRow(identitySource, 2)).toBe(2)
    expect(findViewRow(identitySource, 2)).toBe(2)
  })

  it('uses decorated source coordinate methods when present', () => {
    const source = {
      ...identitySource,
      resolveUnderlyingRow: (row: number) => row + 10,
      findViewRow: (row: number) => row - 10,
    }
    expect(resolveUnderlyingRow(source, 2)).toBe(12)
    expect(findViewRow(source, 12)).toBe(2)
  })
})
