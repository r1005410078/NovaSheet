import type { CellRange } from '../interaction/SelectionModel'
import type { CellFormat, FormatLayer, ResolvedCellFormat } from './CellFormat'

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

  resolveCell(rowIndex: number, colIndex: number): CellFormat | undefined {
    let fillColor: string | undefined
    let fillCleared = false

    // Iterate layers in order; later entries override earlier
    for (const layer of this.layers) {
      if (!inRange(rowIndex, colIndex, layer.range)) continue
      if (layer.clearFill) {
        fillCleared = true
        fillColor = undefined
      } else if (layer.patch.fillColor !== undefined) {
        fillCleared = false
        fillColor = layer.patch.fillColor
      }
    }

    if (fillColor === undefined && fillCleared) return undefined
    if (fillColor === undefined) return undefined
    return { fillColor }
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
    this.nextOrder = layers.length === 0 ? 0 : Math.max(...layers.map(l => l.order)) + 1
  }

  getLayerCount(): number {
    return this.layers.length
  }
}

function inRange(row: number, col: number, range: CellRange): boolean {
  return row >= range.startRow && row <= range.endRow && col >= range.startCol && col <= range.endCol
}
