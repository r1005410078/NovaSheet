import { describe, expect, it } from 'bun:test'
import type { MergeRegion, ResolvedCellFormat } from '@zhiguang/novasheet-core'
import { MergeLookup } from '../../src/paint/merge-lookup'
import { buildFilledCellLookup } from '../../src/paint/filled-lookup'

describe('buildFilledCellLookup', () => {
  it('仅收录有 fillColor 的单元格', () => {
    const formats: ResolvedCellFormat[] = [
      { rowIndex: 0, colIndex: 0, format: { fillColor: '#fff2cc' } },
      { rowIndex: 1, colIndex: 1, format: {} },
    ]
    const lookup = buildFilledCellLookup(formats)
    expect(lookup.has(0, 0)).toBe(true)
    expect(lookup.has(1, 1)).toBe(false)
  })

  it('无填充时返回空集（has 恒 false）', () => {
    const lookup = buildFilledCellLookup([{ rowIndex: 0, colIndex: 0, format: {} }])
    expect(lookup.has(0, 0)).toBe(false)
  })

  it('合并 anchor 的填充扩展为整块；非 anchor 覆盖格的填充忽略', () => {
    const region: MergeRegion = {
      id: 'm1',
      range: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
      anchor: { rowIndex: 0, colIndex: 0 },
    }
    const merges = new MergeLookup([region])
    // anchor 有填充 → 整块 (0,0)-(1,1) 视为填充
    const lookup = buildFilledCellLookup(
      [{ rowIndex: 0, colIndex: 0, format: { fillColor: '#fff2cc' } }],
      merges,
    )
    expect(lookup.has(0, 0)).toBe(true)
    expect(lookup.has(0, 1)).toBe(true)
    expect(lookup.has(1, 0)).toBe(true)
    expect(lookup.has(1, 1)).toBe(true)

    // 非 anchor 覆盖格带 fillColor → 忽略（与 FormatFillPainter 语义一致）
    const ignored = buildFilledCellLookup(
      [{ rowIndex: 1, colIndex: 1, format: { fillColor: '#fff2cc' } }],
      merges,
    )
    expect(ignored.has(1, 1)).toBe(false)
  })
})
