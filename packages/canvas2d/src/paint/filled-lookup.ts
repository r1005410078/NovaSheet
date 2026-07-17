/**
 * 填充格查找构造——把 cellFormats 中“可见为填充”的单元格收进一个 O(1) 查找集，
 * 供 GridLinesPainter 跳过填充格的网格线（与 Sheets 一致：填充色盖住网格线）。
 *
 * 语义与 FormatFillPainter 对齐：合并区 anchor 的填充扩展为整块合并矩形，
 * 被覆盖的非 anchor 单元格忽略其填充——保证“跳线集合”与“实际填充区域”一致。
 */

import type { ResolvedCellFormat } from '@zhiguang/novasheet-core'
import type { MergeLookup } from './merge-lookup'
import type { FilledCellLookup } from '../painters/GridLinesPainter'

const EMPTY: FilledCellLookup = { has: () => false }

/** 由已解析 cellFormats（+ 可选合并表）构造填充格查找；无填充时返回常量空集。 */
export function buildFilledCellLookup(
  cellFormats: readonly ResolvedCellFormat[],
  merges?: MergeLookup,
): FilledCellLookup {
  const set = new Set<string>()
  for (const { rowIndex, colIndex, format } of cellFormats) {
    if (!format.fillColor) continue
    const region = merges?.regionAt(rowIndex, colIndex)
    if (region) {
      if (!merges!.isAnchor(region, rowIndex, colIndex)) continue
      const { startRow, endRow, startCol, endCol } = region.range
      for (let r = startRow; r <= endRow; r++)
        for (let c = startCol; c <= endCol; c++) set.add(`${r}:${c}`)
    } else {
      set.add(`${rowIndex}:${colIndex}`)
    }
  }
  if (set.size === 0) return EMPTY
  return { has: (row, col) => set.has(`${row}:${col}`) }
}
