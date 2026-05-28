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
    this.layers.push({ range, patch: {}, clearFill: true, order: this.nextOrder++ })
  }

  clearBorders(range: CellRange): void {
    this.layers.push({ range, patch: {}, clearBorders: true, order: this.nextOrder++ })
  }

  /**
   * Applies border patches for every cell in `range` using the given preset.
   * `preset === 'clear'` routes to `clearBorders`. The store expands per-cell;
   * callers must not pass 1M-row ranges.
   */
  applyBorders(range: CellRange, preset: BorderPreset, border: BorderStyle): void {
    if (preset === 'clear') {
      this.clearBorders(range)
      return
    }
    for (let row = range.startRow; row <= range.endRow; row++) {
      for (let col = range.startCol; col <= range.endCol; col++) {
        const patch = borderPatchForCell(range, row, col, preset, border)
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
