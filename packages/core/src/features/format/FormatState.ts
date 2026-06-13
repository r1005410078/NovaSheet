import type { CellFormat, FormatLayer } from '../../kernel/protocol/FormatTypes'
import { RangeStyleStore } from './RangeStyleStore'
import type { MergeRegion, MergeStore } from '../merge/MergeStore'
import { MergeStore as MergeStoreImpl } from '../merge/MergeStore'
import { CellAttachmentStore } from '../attachment/CellAttachmentStore'
import type { CellAttachmentSnapshot } from '../../kernel/protocol/AttachmentTypes'

export interface FormatState {
  readonly formatStore: RangeStyleStore
  readonly mergeStore: MergeStore
  readonly attachmentStore: CellAttachmentStore
  resolveCellFormat(rowIndex: number, colIndex: number): CellFormat | undefined
  getMergeRegionAt(rowIndex: number, colIndex: number): MergeRegion | null
  restoreFormat(layers: readonly FormatLayer[]): void
  restoreMerge(regions: readonly MergeRegion[]): void
  remapFormatRows(indexMap: ReadonlyMap<number, number>): void
  remapMergeRows(indexMap: ReadonlyMap<number, number>): void
  remapFormatAfterRowsInserted(at: number, count: number): void
  remapMergeAfterRowsInserted(at: number, count: number): void
  remapFormatAfterRowsDeleted(rowIds: readonly number[]): void
  remapMergeAfterRowsDeleted(rowIds: readonly number[]): void
  remapFormatCols(indexMap: ReadonlyMap<number, number>): void
  remapMergeCols(indexMap: ReadonlyMap<number, number>): void
  remapFormatAfterColsInserted(at: number, count: number): void
  remapMergeAfterColsInserted(at: number, count: number): void
  remapFormatAfterColsDeleted(colIndices: readonly number[]): void
  remapMergeAfterColsDeleted(colIndices: readonly number[]): void
  restoreAttachments(snap: CellAttachmentSnapshot): void
  remapAttachmentAfterRowsInserted(at: number, count: number): void
  remapAttachmentAfterRowsDeleted(rowIds: readonly number[]): void
  remapAttachmentRows(indexMap: ReadonlyMap<number, number>): void
  remapAttachmentAfterColsInserted(at: number, count: number): void
  remapAttachmentAfterColsDeleted(colIndices: readonly number[]): void
  remapAttachmentCols(indexMap: ReadonlyMap<number, number>): void
}

export class DefaultFormatState implements FormatState {
  readonly formatStore = new RangeStyleStore()
  readonly mergeStore = new MergeStoreImpl()
  readonly attachmentStore = new CellAttachmentStore()

  resolveCellFormat(rowIndex: number, colIndex: number): CellFormat | undefined {
    return this.formatStore.resolveCell(rowIndex, colIndex)
  }

  getMergeRegionAt(rowIndex: number, colIndex: number): MergeRegion | null {
    return this.mergeStore.getRegionAt(rowIndex, colIndex)
  }

  restoreFormat(layers: readonly FormatLayer[]): void {
    this.formatStore.restore(layers)
  }

  restoreMerge(regions: readonly MergeRegion[]): void {
    this.mergeStore.restore(regions)
  }

  remapFormatRows(indexMap: ReadonlyMap<number, number>): void {
    this.formatStore.remapByRowIndexMap(indexMap)
  }

  remapMergeRows(indexMap: ReadonlyMap<number, number>): void {
    this.mergeStore.remapByRowIndexMap(indexMap)
  }

  remapFormatAfterRowsInserted(at: number, count: number): void {
    this.formatStore.remapAfterRowsInserted(at, count)
  }

  remapMergeAfterRowsInserted(at: number, count: number): void {
    this.mergeStore.remapAfterRowsInserted(at, count)
  }

  remapFormatAfterRowsDeleted(rowIds: readonly number[]): void {
    this.formatStore.remapAfterRowsDeleted([...rowIds].sort((a, b) => a - b))
  }

  remapMergeAfterRowsDeleted(rowIds: readonly number[]): void {
    this.mergeStore.remapAfterRowsDeleted([...rowIds].sort((a, b) => a - b))
  }

  remapFormatCols(indexMap: ReadonlyMap<number, number>): void {
    this.formatStore.remapByColIndexMap(indexMap)
  }

  remapMergeCols(indexMap: ReadonlyMap<number, number>): void {
    this.mergeStore.remapByColIndexMap(indexMap)
  }

  remapFormatAfterColsInserted(at: number, count: number): void {
    this.formatStore.remapAfterColsInserted(at, count)
  }

  remapMergeAfterColsInserted(at: number, count: number): void {
    this.mergeStore.remapAfterColsInserted(at, count)
  }

  remapFormatAfterColsDeleted(colIndices: readonly number[]): void {
    this.formatStore.remapAfterColsDeleted([...colIndices].sort((a, b) => a - b))
  }

  remapMergeAfterColsDeleted(colIndices: readonly number[]): void {
    this.mergeStore.remapAfterColsDeleted([...colIndices].sort((a, b) => a - b))
  }

  restoreAttachments(snap: CellAttachmentSnapshot): void {
    this.attachmentStore.restore(snap)
  }

  remapAttachmentAfterRowsInserted(at: number, count: number): void {
    this.attachmentStore.remapAfterRowsInserted(at, count)
  }

  remapAttachmentAfterRowsDeleted(rowIds: readonly number[]): void {
    this.attachmentStore.remapAfterRowsDeleted([...rowIds].sort((a, b) => a - b))
  }

  remapAttachmentRows(indexMap: ReadonlyMap<number, number>): void {
    this.attachmentStore.remapByRowIndexMap(indexMap)
  }

  remapAttachmentAfterColsInserted(at: number, count: number): void {
    this.attachmentStore.remapAfterColsInserted(at, count)
  }

  remapAttachmentAfterColsDeleted(colIndices: readonly number[]): void {
    this.attachmentStore.remapAfterColsDeleted([...colIndices].sort((a, b) => a - b))
  }

  remapAttachmentCols(indexMap: ReadonlyMap<number, number>): void {
    this.attachmentStore.remapByColIndexMap(indexMap)
  }
}
