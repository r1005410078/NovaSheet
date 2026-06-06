import { isMutableDataSource } from '../kernel/data/MutableDataSource'
import type { MutableDataSource } from '../kernel/data/MutableDataSource'
import type { DataSource, DataSourceEvent, DataSourceListener } from '../kernel/data/DataSource'
import type { Row } from '../kernel/data/Schema'
import type { ViewLayer, ViewLayerChange } from './ViewLayer'

export interface CollapsedGap {
  readonly atViewRow: number
  readonly hiddenCount: number
  readonly hiddenIds: readonly number[]
}

interface HideRowsSpec {
  readonly hidden: readonly number[]
}

/**
 * Phase 4.5：把指定 underlying 行从视图中隐藏。
 * 与 SortLayer / FilterLayer 同款 ViewLayer 协议；在 ViewPipeline 中
 * 推荐放在 Sort → Filter → **Hide** 顺序末端（spec §5.3）。
 */
export class HideRowsLayer implements ViewLayer<HideRowsSpec> {
  readonly id = 'hide-rows'

  private hiddenUnderlyingRows = new Set<number>()
  private visibleRows: number[] = []
  private currentUpstream: DataSource | null = null
  private notify: ((change: ViewLayerChange) => void) | null = null

  bindPipeline(notify: (change: ViewLayerChange) => void): void {
    this.notify = notify
  }

  getSpec(): HideRowsSpec {
    return { hidden: Array.from(this.hiddenUnderlyingRows).sort((a, b) => a - b) }
  }

  setSpec(spec: HideRowsSpec): boolean {
    const next = new Set(spec.hidden)
    if (sameSet(this.hiddenUnderlyingRows, next)) return false
    this.hiddenUnderlyingRows = next
    this.rebuildVisible()
    this.notify?.({ layerId: this.id, reason: 'spec-changed' })
    return true
  }

  setHidden(underlyingRowIds: readonly number[]): boolean {
    return this.setSpec({ hidden: underlyingRowIds })
  }

  addHidden(underlyingRowIds: readonly number[]): boolean {
    const next = new Set(this.hiddenUnderlyingRows)
    for (const id of underlyingRowIds) next.add(id)
    return this.setSpec({ hidden: Array.from(next) })
  }

  removeHidden(underlyingRowIds: readonly number[]): boolean {
    const next = new Set(this.hiddenUnderlyingRows)
    for (const id of underlyingRowIds) next.delete(id)
    return this.setSpec({ hidden: Array.from(next) })
  }

  getHiddenUnderlyingRows(): ReadonlySet<number> {
    return this.hiddenUnderlyingRows
  }

  getCollapsedGaps(): readonly CollapsedGap[] {
    if (this.hiddenUnderlyingRows.size === 0) return []
    const hiddenSorted = Array.from(this.hiddenUnderlyingRows).sort((a, b) => a - b)
    const gaps: CollapsedGap[] = []
    let run: number[] = []
    for (const id of hiddenSorted) {
      if (run.length === 0 || id === run[run.length - 1]! + 1) {
        run.push(id)
      } else {
        gaps.push(this.makeGap(run))
        run = [id]
      }
    }
    if (run.length > 0) gaps.push(this.makeGap(run))
    return gaps
  }

  wrap(upstream: DataSource): DataSource {
    this.currentUpstream = upstream
    this.rebuildVisibleFor(upstream)
    return new HiddenDataSource(upstream, this)
  }

  /** Called by HiddenDataSource when an upstream event arrives. */
  _handleUpstreamEvent(event: DataSourceEvent, upstream: DataSource): void {
    let changed = false
    switch (event.type) {
      case 'rowsInserted': {
        const shifted = new Set<number>()
        for (const id of this.hiddenUnderlyingRows) {
          shifted.add(id >= event.at ? id + event.count : id)
        }
        this.hiddenUnderlyingRows = shifted
        changed = true
        break
      }
      case 'rowsDeleted': {
        const removed = new Set(event.removed)
        const sortedRemoved = [...event.removed]
        const shifted = new Set<number>()
        for (const id of this.hiddenUnderlyingRows) {
          if (removed.has(id)) continue
          let shift = 0
          for (const r of sortedRemoved) if (r < id) shift += 1
          shifted.add(id - shift)
        }
        this.hiddenUnderlyingRows = shifted
        changed = true
        break
      }
      case 'reset':
        this.hiddenUnderlyingRows = new Set()
        changed = true
        break
      default:
        break
    }
    if (changed) {
      this.rebuildVisibleFor(upstream)
      this.notify?.({ layerId: this.id, reason: event.type === 'reset' ? 'upstream-reset' : 'spec-changed' })
    }
  }

  getVisibleRows(): readonly number[] {
    return this.visibleRows
  }

  private rebuildVisibleFor(upstream: DataSource): void {
    const total = upstream.getRowCount()
    const next: number[] = []
    for (let i = 0; i < total; i += 1) {
      // 将 upstream 视图行 i 映射到 raw underlying id，再检查 hidden set
      const rawUnderlying = upstream.resolveUnderlyingRow?.(i) ?? i
      if (!this.hiddenUnderlyingRows.has(rawUnderlying)) next.push(i)
    }
    this.visibleRows = next
  }

  private rebuildVisible(): void {
    if (this.currentUpstream != null) {
      this.rebuildVisibleFor(this.currentUpstream)
    }
  }

  private makeGap(run: number[]): CollapsedGap {
    const first = run[0]!
    // atViewRow = 紧邻 hidden run 之前的最后一个 visible underlying 行在 visibleRows 中的索引
    const upperUnderlying = first - 1
    const atViewRow = upperUnderlying < 0 ? -1 : this.visibleRows.indexOf(upperUnderlying)
    return { atViewRow, hiddenCount: run.length, hiddenIds: run.slice() }
  }
}

/** Internal DataSource wrapper produced by HideRowsLayer.wrap(). Not exported. */
class HiddenDataSource implements DataSource {
  private disposed = false
  private listeners = new Set<DataSourceListener>()
  private readonly unsubscribeFromUpstream: () => void
  readonly updateCell?: MutableDataSource['updateCell']
  readonly updateCellByUnderlyingRow?: MutableDataSource['updateCellByUnderlyingRow']
  readonly insertRows?: MutableDataSource['insertRows']
  readonly deleteRows?: MutableDataSource['deleteRows']
  readonly moveRows?: MutableDataSource['moveRows']

  constructor(
    private readonly upstream: DataSource,
    private readonly layer: HideRowsLayer,
  ) {
    const mutableUpstream = isMutableDataSource(this.upstream) ? this.upstream : null
    if (mutableUpstream) {
      this.updateCell = (rowIndex, fieldId, value) => {
        const upstreamRow = this.layer.getVisibleRows()[rowIndex]
        if (upstreamRow == null) return
        mutableUpstream.updateCell(upstreamRow, fieldId, value)
      }
      this.updateCellByUnderlyingRow = (underlyingRow, fieldId, value) => {
        if (mutableUpstream.updateCellByUnderlyingRow) {
          mutableUpstream.updateCellByUnderlyingRow(underlyingRow, fieldId, value)
          return
        }
        const upstreamRow = this.upstream.findViewRow?.(underlyingRow) ?? underlyingRow
        mutableUpstream.updateCell(upstreamRow, fieldId, value)
      }
      // insertRows / deleteRows use underlying coordinates (spec §7.1)
      if (mutableUpstream.insertRows) {
        this.insertRows = (beforeUnderlyingRow, count) =>
          mutableUpstream.insertRows!(beforeUnderlyingRow, count)
      }
      if (mutableUpstream.deleteRows) {
        this.deleteRows = (underlyingRowIds) => mutableUpstream.deleteRows!(underlyingRowIds)
      }
      if (mutableUpstream.moveRows) {
        this.moveRows = (underlyingRowIds, beforeRowId) =>
          mutableUpstream.moveRows!(underlyingRowIds, beforeRowId)
      }
    }
    this.unsubscribeFromUpstream = this.upstream.subscribe((event) =>
      this.handleUpstreamEvent(event),
    )
  }

  getRowCount(): number {
    return this.layer.getVisibleRows().length
  }

  getSchema() {
    return this.upstream.getSchema()
  }

  getRows(startIndex: number, endIndex: number): Row[] {
    const visibleRows = this.layer.getVisibleRows()
    const start = Math.max(0, startIndex)
    const end = Math.min(visibleRows.length - 1, endIndex)
    if (end < start) return []
    const rows: Row[] = []
    for (let viewRow = start; viewRow <= end; viewRow += 1) {
      const upstreamRow = visibleRows[viewRow]
      if (upstreamRow == null) continue
      const upstreamRows = this.upstream.getRows(upstreamRow, upstreamRow)
      if (upstreamRows instanceof Promise) {
        throw new Error('HideRowsLayer requires synchronous upstream rows')
      }
      const row = upstreamRows[0]
      if (row) rows.push(row)
    }
    return rows
  }

  getCell(rowIndex: number, fieldId: string) {
    const upstreamRow = this.layer.getVisibleRows()[rowIndex]
    if (upstreamRow == null) return undefined
    return this.upstream.getCell(upstreamRow, fieldId)
  }

  resolveUnderlyingRow(viewRow: number): number {
    const upstreamRow = this.layer.getVisibleRows()[viewRow]
    if (upstreamRow == null) return -1
    return this.upstream.resolveUnderlyingRow?.(upstreamRow) ?? upstreamRow
  }

  findViewRow(underlyingRow: number): number {
    const upstreamView = this.upstream.findViewRow?.(underlyingRow) ?? underlyingRow
    const idx = this.layer.getVisibleRows().indexOf(upstreamView)
    return idx >= 0 ? idx : -1
  }

  subscribe(listener: DataSourceListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.unsubscribeFromUpstream()
    this.listeners.clear()
  }

  private handleUpstreamEvent(event: DataSourceEvent): void {
    if (this.disposed) return
    this.layer._handleUpstreamEvent(event, this.upstream)
    this.emit(event)
  }

  private emit(event: DataSourceEvent): void {
    for (const listener of this.listeners) {
      listener(event)
    }
  }
}

function sameSet(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}
