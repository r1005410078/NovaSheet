import type { CellRange } from '../features/selection/SelectionTypes'
import type { RawRange } from '../kernel/coords/coordinates'
import type { BorderPreset, BorderStyle, CellFormat, FormatLayer, ResolvedCellFormat } from './CellFormat'
import { borderPatchForCell } from './BorderPreset'
import { isCellInRange, rangesIntersect } from '../kernel/geometry/range'
import {
  remapSpanAfterDelete,
  remapSpanAfterInsert,
  remapSpanByIndexMap,
} from '../kernel/coords/remap'

/** Append-only sparse manual format store. Later layers win over earlier ones. */
export class RangeStyleStore {
  private layers: FormatLayer[] = []
  private nextOrder = 0

  apply(range: RawRange, patch: CellFormat): void {
    this.layers.push({ range, patch, order: this.nextOrder++ })
  }

  clearFill(range: RawRange): void {
    // Kind-aware no-op guard: only push when an intersecting layer actually contributes a fill
    // (a fillColor patch or a prior clearFill marker). Clearing fill over borders-only cells would
    // change nothing yet still grow the snapshot, producing a spurious format undo entry.
    if (!this.anyLayerContributesFill(range)) return
    this.layers.push({ range, patch: {}, clearFill: true, order: this.nextOrder++ })
  }

  clearBorders(range: RawRange): void {
    // Symmetric to clearFill: only push when an intersecting layer contributes borders
    // (a borders patch or a prior clearBorders marker).
    if (!this.anyLayerContributesBorders(range)) return
    this.layers.push({ range, patch: {}, clearBorders: true, order: this.nextOrder++ })
  }

  /** True when some intersecting layer would set or clear a fillColor for `target`. O(layers). */
  private anyLayerContributesFill(target: CellRange): boolean {
    for (const layer of this.layers) {
      if (!rangesIntersect(layer.range, target)) continue
      if (layer.clearFill || layer.patch.fillColor !== undefined) return true
    }
    return false
  }

  /** True when some intersecting layer would set or clear borders for `target`. O(layers). */
  private anyLayerContributesBorders(target: CellRange): boolean {
    for (const layer of this.layers) {
      if (!rangesIntersect(layer.range, target)) continue
      if (layer.clearBorders || layer.patch.borders !== undefined) return true
    }
    return false
  }

  /**
   * Applies border patches for every cell in `range` using the given preset.
   * `preset === 'clear'` routes to `clearBorders` and requires no `border`.
   * All other presets require a `border` style and expand per-cell;
   * callers must not pass 1M-row ranges.
   */
  applyBorders(range: RawRange, preset: 'clear'): void
  applyBorders(range: RawRange, preset: Exclude<BorderPreset, 'clear'>, border: BorderStyle): void
  applyBorders(range: RawRange, preset: BorderPreset, border?: BorderStyle): void {
    if (preset === 'clear') {
      this.clearBorders(range)
      return
    }
    for (let row = range.startRow; row <= range.endRow; row++) {
      for (let col = range.startCol; col <= range.endCol; col++) {
        const patch = borderPatchForCell(range, row, col, preset, border!)
        // Only push a layer when the patch actually sets at least one edge.
        if (Object.keys(patch).length > 0) {
          const cellRange: CellRange = { startRow: row, endRow: row, startCol: col, endCol: col }
          this.layers.push({ range: cellRange, patch: { borders: patch }, order: this.nextOrder++ })
        }
      }
    }
  }

  resolveCell(rowIndex: number, colIndex: number): CellFormat | undefined {
    // Accumulate field-level overrides in write order; undefined fields do not clear prior values.
    // A cleared cell and a never-formatted cell both resolve to undefined by design.
    let fillColor: string | undefined
    let fillActive = false   // true once a fillColor has been set (not cleared)
    let borders: CellFormat['borders']
    let hasBorders = false
    let textWrap: CellFormat['textWrap']

    for (const layer of this.layers) {
      if (!isCellInRange(rowIndex, colIndex, layer.range)) continue
      if (layer.clearFill) {
        fillColor = undefined
        fillActive = false
      } else if (layer.clearBorders) {
        borders = undefined
        hasBorders = false
      } else {
        if (layer.patch.fillColor !== undefined) {
          fillColor = layer.patch.fillColor
          fillActive = true
        }
        if (layer.patch.borders !== undefined) {
          borders = { ...borders, ...layer.patch.borders }
          hasBorders = true
        }
        if (layer.patch.textWrap !== undefined) textWrap = layer.patch.textWrap
      }
    }

    if (!fillActive && !hasBorders && textWrap === undefined) return undefined
    const result: CellFormat = {
      ...(fillActive ? { fillColor } : {}),
      ...(hasBorders ? { borders } : {}),
      ...(textWrap !== undefined ? { textWrap } : {}),
    }
    return result
  }

  resolveVisible(range: RawRange): readonly ResolvedCellFormat[] {
    const result: ResolvedCellFormat[] = []
    for (let row = range.startRow; row <= range.endRow; row++) {
      for (let col = range.startCol; col <= range.endCol; col++) {
        const format = this.resolveCell(row, col)
        if (format !== undefined) {
          result.push({ rowIndex: row, colIndex: col, format })
        }
      }
    }
    return result
  }

  snapshot(): readonly FormatLayer[] {
    return [...this.layers]
  }

  restore(layers: readonly FormatLayer[]): void {
    this.layers = [...layers]
    this.nextOrder = layers.reduce((m, l) => Math.max(m, l.order), -1) + 1
  }

  getLayerCount(): number {
    return this.layers.length
  }

  /** 行结构变更（raw 坐标）：在 `at` 前插入 `count` 行，平移每层的行区间。 */
  remapAfterRowsInserted(at: number, count: number): void {
    if (count <= 0) return
    this.remapLayers((range) => {
      const rows = remapSpanAfterInsert({ start: range.startRow, end: range.endRow }, at, count)
      return { ...range, startRow: rows.start, endRow: rows.end }
    })
  }

  /** 行结构变更（raw 坐标）：删除 `removedSorted` 行；无幸存行的层被丢弃。 */
  remapAfterRowsDeleted(removedSorted: readonly number[]): void {
    if (removedSorted.length === 0) return
    this.remapLayers((range) => {
      const rows = remapSpanAfterDelete({ start: range.startRow, end: range.endRow }, removedSorted)
      if (!rows) return null
      return { ...range, startRow: rows.start, endRow: rows.end }
    })
  }

  /** 列结构变更（raw 坐标）：在 `at` 前插入 `count` 列，平移每层的列区间。 */
  remapAfterColsInserted(at: number, count: number): void {
    if (count <= 0) return
    this.remapLayers((range) => {
      const cols = remapSpanAfterInsert({ start: range.startCol, end: range.endCol }, at, count)
      return { ...range, startCol: cols.start, endCol: cols.end }
    })
  }

  /** 列结构变更（raw 坐标）：删除 `removedSorted` 列；无幸存列的层被丢弃。 */
  remapAfterColsDeleted(removedSorted: readonly number[]): void {
    if (removedSorted.length === 0) return
    this.remapLayers((range) => {
      const cols = remapSpanAfterDelete({ start: range.startCol, end: range.endCol }, removedSorted)
      if (!cols) return null
      return { ...range, startCol: cols.start, endCol: cols.end }
    })
  }

  /** 行 reorder（raw 坐标）：用 `oldIndex → newIndex` map 映射每层行区间后重规整。 */
  remapByRowIndexMap(indexMap: ReadonlyMap<number, number>): void {
    this.remapLayers((range) => {
      const rows = remapSpanByIndexMap({ start: range.startRow, end: range.endRow }, indexMap)
      if (!rows) return null
      return { ...range, startRow: rows.start, endRow: rows.end }
    })
  }

  /** 列 reorder（raw 坐标）：用 `oldIndex → newIndex` map 映射每层列区间后重规整。 */
  remapByColIndexMap(indexMap: ReadonlyMap<number, number>): void {
    this.remapLayers((range) => {
      const cols = remapSpanByIndexMap({ start: range.startCol, end: range.endCol }, indexMap)
      if (!cols) return null
      return { ...range, startCol: cols.start, endCol: cols.end }
    })
  }

  /** 对每层 range 应用 `remap`；返回 null 的层被丢弃（保持原有 order 相对顺序）。 */
  private remapLayers(remap: (range: CellRange) => CellRange | null): void {
    const next: FormatLayer[] = []
    for (const layer of this.layers) {
      const range = remap(layer.range)
      if (range) next.push({ ...layer, range })
    }
    this.layers = next
  }
}
