import {
  remapColIndexAfterDelete,
  remapColIndexAfterInsert,
  remapRowIndexAfterDelete,
  remapRowIndexAfterInsert,
} from '../../kernel/coords/remap'
import type { ValidationState } from '../../kernel/protocol/ValidationTypes'

function key(r: number, c: number): string {
  return `${r}:${c}`
}

function parseKey(k: string): readonly [number, number] {
  const i = k.indexOf(':')
  return [Number.parseInt(k.slice(0, i), 10), Number.parseInt(k.slice(i + 1), 10)]
}

export class ValidationResultStore {
  private cells = new Map<string, ValidationState>()

  set(rawRow: number, rawCol: number, state: ValidationState): void {
    this.cells.set(key(rawRow, rawCol), state)
  }

  delete(rawRow: number, rawCol: number): void {
    this.cells.delete(key(rawRow, rawCol))
  }

  get(rawRow: number, rawCol: number): ValidationState | null {
    return this.cells.get(key(rawRow, rawCol)) ?? null
  }

  clear(): void {
    this.cells.clear()
  }

  remapAfterRowsInserted(at: number, count: number): void {
    if (count <= 0) return
    this.remap((r, c, s) => ({ r: remapRowIndexAfterInsert(r, at, count), c, s }))
  }

  remapAfterRowsDeleted(removedSorted: readonly number[]): void {
    if (removedSorted.length === 0) return
    this.remap((r, c, s) => {
      const next = remapRowIndexAfterDelete(r, removedSorted)
      return next === null ? null : { r: next, c, s }
    })
  }

  remapAfterColsInserted(at: number, count: number): void {
    if (count <= 0) return
    this.remap((r, c, s) => ({ r, c: remapColIndexAfterInsert(c, at, count), s }))
  }

  remapAfterColsDeleted(removedSorted: readonly number[]): void {
    if (removedSorted.length === 0) return
    this.remap((r, c, s) => {
      const next = remapColIndexAfterDelete(c, removedSorted)
      return next === null ? null : { r, c: next, s }
    })
  }

  remapByRowIndexMap(map: ReadonlyMap<number, number>): void {
    this.remap((r, c, s) => {
      const next = map.get(r)
      return next === undefined ? null : { r: next, c, s }
    })
  }

  remapByColIndexMap(map: ReadonlyMap<number, number>): void {
    this.remap((r, c, s) => {
      const next = map.get(c)
      return next === undefined ? null : { r, c: next, s }
    })
  }

  private remap(
    fn: (r: number, c: number, s: ValidationState) => { r: number; c: number; s: ValidationState } | null,
  ): void {
    const next = new Map<string, ValidationState>()
    for (const [k, s] of this.cells) {
      const [r, c] = parseKey(k)
      const result = fn(r, c, s)
      if (result !== null) next.set(key(result.r, result.c), result.s)
    }
    this.cells = next
  }
}
