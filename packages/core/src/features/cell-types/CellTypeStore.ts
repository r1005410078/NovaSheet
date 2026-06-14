import type { RawRange } from '../../kernel/coords/coordinates'
import type { Field, FieldType } from '../../kernel/data/Schema'
import type { CellTypeOverride } from '../../kernel/protocol/CellTypeTypes'
import {
  remapColIndexAfterDelete,
  remapColIndexAfterInsert,
  remapRowIndexAfterDelete,
  remapRowIndexAfterInsert,
} from '../../kernel/coords/remap'

export type { CellTypeOverride } from '../../kernel/protocol/CellTypeTypes'

export interface CellTypeEntry {
  readonly rowIndex: number
  readonly colIndex: number
  readonly type: CellTypeOverride
}

export type CellTypeSnapshot = readonly CellTypeEntry[]

export function normalizeFieldType(type: FieldType): CellTypeOverride {
  switch (type) {
    case 'number':
      return 'number'
    case 'date':
      return 'date'
    case 'checkbox':
      return 'checkbox'
    default:
      return 'text'
  }
}

export class CellTypeStore {
  private cells = new Map<string, CellTypeOverride>()

  set(range: RawRange, type: CellTypeOverride): void {
    for (let row = range.startRow; row <= range.endRow; row += 1) {
      for (let col = range.startCol; col <= range.endCol; col += 1) {
        this.cells.set(key(row, col), type)
      }
    }
  }

  clear(range: RawRange): void {
    for (let row = range.startRow; row <= range.endRow; row += 1) {
      for (let col = range.startCol; col <= range.endCol; col += 1) {
        this.cells.delete(key(row, col))
      }
    }
  }

  get(rowIndex: number, colIndex: number): CellTypeOverride | undefined {
    return this.cells.get(key(rowIndex, colIndex))
  }

  resolve(rowIndex: number, colIndex: number, field: Field): CellTypeOverride {
    return this.get(rowIndex, colIndex) ?? normalizeFieldType(field.type)
  }

  snapshot(): CellTypeSnapshot {
    return [...this.entries()].sort((a, b) => a.rowIndex - b.rowIndex || a.colIndex - b.colIndex)
  }

  restore(snapshot: CellTypeSnapshot): void {
    const next = new Map<string, CellTypeOverride>()
    for (const entry of snapshot) {
      next.set(key(entry.rowIndex, entry.colIndex), entry.type)
    }
    this.cells = next
  }

  remapAfterRowsInserted(at: number, count: number): void {
    if (count <= 0) return
    this.remap((rowIndex, colIndex, type) => ({
      rowIndex: remapRowIndexAfterInsert(rowIndex, at, count),
      colIndex,
      type,
    }))
  }

  remapAfterRowsDeleted(removedSorted: readonly number[]): void {
    if (removedSorted.length === 0) return
    this.remap((rowIndex, colIndex, type) => {
      const nextRow = remapRowIndexAfterDelete(rowIndex, removedSorted)
      return nextRow === null ? null : { rowIndex: nextRow, colIndex, type }
    })
  }

  remapAfterColsInserted(at: number, count: number): void {
    if (count <= 0) return
    this.remap((rowIndex, colIndex, type) => ({
      rowIndex,
      colIndex: remapColIndexAfterInsert(colIndex, at, count),
      type,
    }))
  }

  remapAfterColsDeleted(removedSorted: readonly number[]): void {
    if (removedSorted.length === 0) return
    this.remap((rowIndex, colIndex, type) => {
      const nextCol = remapColIndexAfterDelete(colIndex, removedSorted)
      return nextCol === null ? null : { rowIndex, colIndex: nextCol, type }
    })
  }

  remapByRowIndexMap(indexMap: ReadonlyMap<number, number>): void {
    this.remap((rowIndex, colIndex, type) => {
      const nextRow = indexMap.get(rowIndex)
      return nextRow === undefined ? null : { rowIndex: nextRow, colIndex, type }
    })
  }

  remapByColIndexMap(indexMap: ReadonlyMap<number, number>): void {
    this.remap((rowIndex, colIndex, type) => {
      const nextCol = indexMap.get(colIndex)
      return nextCol === undefined ? null : { rowIndex, colIndex: nextCol, type }
    })
  }

  private remap(
    remapEntry: (
      rowIndex: number,
      colIndex: number,
      type: CellTypeOverride,
    ) => CellTypeEntry | null,
  ): void {
    const next = new Map<string, CellTypeOverride>()
    for (const entry of this.entries()) {
      const remapped = remapEntry(entry.rowIndex, entry.colIndex, entry.type)
      if (remapped !== null) {
        next.set(key(remapped.rowIndex, remapped.colIndex), remapped.type)
      }
    }
    this.cells = next
  }

  private *entries(): Iterable<CellTypeEntry> {
    for (const [cellKey, type] of this.cells) {
      const [rowIndex, colIndex] = parseKey(cellKey)
      yield { rowIndex, colIndex, type }
    }
  }
}

function key(rowIndex: number, colIndex: number): string {
  return `${rowIndex}:${colIndex}`
}

function parseKey(cellKey: string): readonly [number, number] {
  const separator = cellKey.indexOf(':')
  return [
    Number.parseInt(cellKey.slice(0, separator), 10),
    Number.parseInt(cellKey.slice(separator + 1), 10),
  ]
}
