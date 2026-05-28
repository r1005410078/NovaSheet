import type { CellRange } from '../interaction/SelectionModel'
import type { BorderPreset, BorderStyle, CellFormat, FormatLayer, ResolvedCellFormat } from './CellFormat'
import { borderPatchForCell } from './BorderPreset'

/** Append-only sparse manual format store. Later layers win over earlier ones. */
export class RangeStyleStore {
  private layers: FormatLayer[] = []
  private nextOrder = 0

  apply(range: CellRange, patch: CellFormat): void {
    this.layers.push({ range, patch, order: this.nextOrder++ })
  }

  clearFill(range: CellRange): void {
    // Only push a clear layer when at least one existing layer intersects the target range;
    // otherwise there is nothing to clear and the store stays unchanged (no-op, no undo entry).
    if (!this.anyLayerIntersects(range)) return
    this.layers.push({ range, patch: {}, clearFill: true, order: this.nextOrder++ })
  }

  clearBorders(range: CellRange): void {
    // Same guard as clearFill: skip push when no existing layer can contribute borders here.
    if (!this.anyLayerIntersects(range)) return
    this.layers.push({ range, patch: {}, clearBorders: true, order: this.nextOrder++ })
  }

  /** Returns true when at least one existing layer's range overlaps `target`. O(layers). */
  private anyLayerIntersects(target: CellRange): boolean {
    for (const layer of this.layers) {
      if (rangesIntersect(layer.range, target)) return true
    }
    return false
  }

  /**
   * Applies border patches for every cell in `range` using the given preset.
   * `preset === 'clear'` routes to `clearBorders` and requires no `border`.
   * All other presets require a `border` style and expand per-cell;
   * callers must not pass 1M-row ranges.
   */
  applyBorders(range: CellRange, preset: 'clear'): void
  applyBorders(range: CellRange, preset: Exclude<BorderPreset, 'clear'>, border: BorderStyle): void
  applyBorders(range: CellRange, preset: BorderPreset, border?: BorderStyle): void {
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

    for (const layer of this.layers) {
      if (!inRange(rowIndex, colIndex, layer.range)) continue
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
          borders = layer.patch.borders
          hasBorders = true
        }
      }
    }

    if (!fillActive && !hasBorders) return undefined
    const result: { fillColor?: string; borders?: CellFormat['borders'] } = {}
    if (fillActive) result.fillColor = fillColor
    if (hasBorders) result.borders = borders
    return result
  }

  resolveVisible(range: CellRange): readonly ResolvedCellFormat[] {
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
}

function inRange(row: number, col: number, range: CellRange): boolean {
  return row >= range.startRow && row <= range.endRow && col >= range.startCol && col <= range.endCol
}

function rangesIntersect(a: CellRange, b: CellRange): boolean {
  return a.startRow <= b.endRow && a.endRow >= b.startRow &&
    a.startCol <= b.endCol && a.endCol >= b.startCol
}
