import {
  remapSpanAfterDelete,
  remapSpanAfterInsert,
  remapSpanByIndexMap,
} from '../../kernel/coords/remap'
import type { CellAttachmentSnapshot } from '../../kernel/protocol/AttachmentTypes'

/** per-cell raw-key 附件存储。语义无关：core 不解释 data。键控与 remap 与 RangeStyleStore 一致。 */
export class CellAttachmentStore {
  /** rawRow -> rawCol -> namespace -> data */
  private cells = new Map<number, Map<number, Map<string, unknown>>>()

  get(namespace: string, rawRow: number, rawCol: number): unknown {
    return this.cells.get(rawRow)?.get(rawCol)?.get(namespace)
  }

  set<T>(namespace: string, rawRow: number, rawCol: number, data: T | undefined): void {
    if (data === undefined) {
      const ns = this.cells.get(rawRow)?.get(rawCol)
      ns?.delete(namespace)
      return
    }
    let row = this.cells.get(rawRow)
    if (!row) { row = new Map(); this.cells.set(rawRow, row) }
    let col = row.get(rawCol)
    if (!col) { col = new Map(); row.set(rawCol, col) }
    col.set(namespace, data)
  }

  snapshot(): CellAttachmentSnapshot {
    const out: { row: number; col: number; namespace: string; data: unknown }[] = []
    for (const [row, cols] of this.cells)
      for (const [col, ns] of cols)
        for (const [namespace, data] of ns) out.push({ row, col, namespace, data })
    return out
  }

  restore(snap: CellAttachmentSnapshot): void {
    this.cells = new Map()
    for (const e of snap) this.set(e.namespace, e.row, e.col, e.data)
  }

  remapAfterRowsInserted(at: number, count: number): void {
    if (count <= 0) return
    // remapSpanAfterInsert never returns null for single-point spans
    this.remapRows((r) => remapSpanAfterInsert({ start: r, end: r }, at, count).start)
  }

  remapAfterRowsDeleted(removedSorted: readonly number[]): void {
    if (removedSorted.length === 0) return
    this.remapRows((r) => remapSpanAfterDelete({ start: r, end: r }, removedSorted)?.start ?? null)
  }

  remapByRowIndexMap(indexMap: ReadonlyMap<number, number>): void {
    this.remapRows((r) => remapSpanByIndexMap({ start: r, end: r }, indexMap)?.start ?? null)
  }

  remapAfterColsInserted(at: number, count: number): void {
    if (count <= 0) return
    this.remapCols((c) => remapSpanAfterInsert({ start: c, end: c }, at, count).start)
  }

  remapAfterColsDeleted(removedSorted: readonly number[]): void {
    if (removedSorted.length === 0) return
    this.remapCols((c) => remapSpanAfterDelete({ start: c, end: c }, removedSorted)?.start ?? null)
  }

  remapByColIndexMap(indexMap: ReadonlyMap<number, number>): void {
    this.remapCols((c) => remapSpanByIndexMap({ start: c, end: c }, indexMap)?.start ?? null)
  }

  private remapRows(map: (row: number) => number | null): void {
    const snap = this.snapshot()
    this.cells = new Map()
    for (const e of snap) {
      const row = map(e.row)
      if (row !== null) this.set(e.namespace, row, e.col, e.data)
    }
  }

  private remapCols(map: (col: number) => number | null): void {
    const snap = this.snapshot()
    this.cells = new Map()
    for (const e of snap) {
      const col = map(e.col)
      if (col !== null) this.set(e.namespace, e.row, col, e.data)
    }
  }
}
