import type { RawRange } from '../../kernel/coords/coordinates'
import {
  remapColIndexAfterDelete,
  remapColIndexAfterInsert,
  remapRowIndexAfterDelete,
  remapRowIndexAfterInsert,
} from '../../kernel/coords/remap'
import type { ValidationRule } from '../../kernel/protocol/ValidationTypes'

function key(r: number, c: number): string {
  return `${r}:${c}`
}

function parseKey(k: string): readonly [number, number] {
  const i = k.indexOf(':')
  return [Number.parseInt(k.slice(0, i), 10), Number.parseInt(k.slice(i + 1), 10)]
}

export class ValidationRuleStore {
  private cells = new Map<string, ValidationRule>()

  setRange(range: RawRange, rule: ValidationRule): void {
    for (let r = range.startRow; r <= range.endRow; r++) {
      for (let c = range.startCol; c <= range.endCol; c++) {
        this.cells.set(key(r, c), rule)
      }
    }
  }

  clearRange(range: RawRange): void {
    for (let r = range.startRow; r <= range.endRow; r++) {
      for (let c = range.startCol; c <= range.endCol; c++) {
        this.cells.delete(key(r, c))
      }
    }
  }

  get(rawRow: number, rawCol: number): ValidationRule | null {
    return this.cells.get(key(rawRow, rawCol)) ?? null
  }

  *allCells(): Iterable<{ rawRow: number; rawCol: number; rule: ValidationRule }> {
    for (const [k, rule] of this.cells) {
      const [rawRow, rawCol] = parseKey(k)
      yield { rawRow, rawCol, rule }
    }
  }

  remapAfterRowsInserted(at: number, count: number): void {
    if (count <= 0) return
    this.remap((r, c, rule) => ({ r: remapRowIndexAfterInsert(r, at, count), c, rule }))
  }

  remapAfterRowsDeleted(removedSorted: readonly number[]): void {
    if (removedSorted.length === 0) return
    this.remap((r, c, rule) => {
      const next = remapRowIndexAfterDelete(r, removedSorted)
      return next === null ? null : { r: next, c, rule }
    })
  }

  remapAfterColsInserted(at: number, count: number): void {
    if (count <= 0) return
    this.remap((r, c, rule) => ({ r, c: remapColIndexAfterInsert(c, at, count), rule }))
  }

  remapAfterColsDeleted(removedSorted: readonly number[]): void {
    if (removedSorted.length === 0) return
    this.remap((r, c, rule) => {
      const next = remapColIndexAfterDelete(c, removedSorted)
      return next === null ? null : { r, c: next, rule }
    })
  }

  remapByRowIndexMap(map: ReadonlyMap<number, number>): void {
    this.remap((r, c, rule) => {
      const next = map.get(r)
      return next === undefined ? null : { r: next, c, rule }
    })
  }

  remapByColIndexMap(map: ReadonlyMap<number, number>): void {
    this.remap((r, c, rule) => {
      const next = map.get(c)
      return next === undefined ? null : { r, c: next, rule }
    })
  }

  private remap(
    fn: (r: number, c: number, rule: ValidationRule) => { r: number; c: number; rule: ValidationRule } | null,
  ): void {
    const next = new Map<string, ValidationRule>()
    for (const [k, rule] of this.cells) {
      const [r, c] = parseKey(k)
      const result = fn(r, c, rule)
      if (result !== null) next.set(key(result.r, result.c), result.rule)
    }
    this.cells = next
  }
}
