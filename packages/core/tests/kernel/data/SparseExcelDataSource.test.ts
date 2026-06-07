import { describe, expect, it } from 'bun:test'

import { SparseExcelDataSource } from '../../../src/kernel/data/SparseExcelDataSource'

describe('SparseExcelDataSource', () => {
  it('starts as A-Z x 1000 without materializing blank rows', () => {
    const data = new SparseExcelDataSource()

    expect(data.getRowCount()).toBe(1_000)
    expect(data.getSchema().fields).toHaveLength(26)
    expect(data.getSchema().fields[0]?.name).toBe('A')
    expect(data.getSchema().fields[25]?.name).toBe('Z')
    expect(data.getRows(0, 10)).toHaveLength(11)
    expect(data.getCell(999, 'Z')).toBeUndefined()
    expect(data.getContentBounds()).toBeNull()
  })

  it('tracks content bounds for materialized cells', () => {
    const data = new SparseExcelDataSource()

    data.updateCell(980, 'Z', 'edge')

    expect(data.getCell(980, 'Z')).toBe('edge')
    expect(data.getContentBounds()).toEqual({
      startRow: 980,
      endRow: 980,
      startCol: 25,
      endCol: 25,
    })
    expect(data.hasMaterializedRows(970, 999)).toBe(true)
    expect(data.hasMaterializedCols(20, 25)).toBe(true)
  })

  it('appends and shrinks blank capacity without dropping content', () => {
    const data = new SparseExcelDataSource()
    data.updateCell(980, 'Z', 'edge')

    data.appendRows(200)
    data.appendCols(10)

    expect(data.getRowCount()).toBe(1_200)
    expect(data.getSchema().fields).toHaveLength(36)
    expect(data.getSchema().fields[26]?.name).toBe('AA')

    data.resizeWorkspace({ rowCount: 1_050, colCount: 30 })

    expect(data.getRowCount()).toBe(1_050)
    expect(data.getSchema().fields).toHaveLength(30)
    expect(data.getCell(980, 'Z')).toBe('edge')
  })

  it('rejects shrink targets that would drop materialized content', () => {
    const data = new SparseExcelDataSource()
    data.updateCell(980, 'Z', 'edge')

    expect(() => data.resizeWorkspace({ rowCount: 500, colCount: 26 })).toThrow(
      'SparseExcelDataSource.resizeWorkspace: target would drop materialized content',
    )
  })
})
