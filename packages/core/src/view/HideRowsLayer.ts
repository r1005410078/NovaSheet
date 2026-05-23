import type { DataSource, DataSourceEvent } from '../data/DataSource'
import type { Row } from '../data/Schema'
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
  private upstream: DataSource | null = null
  private unsubscribe: (() => void) | null = null
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
    this.unsubscribe?.()
    this.upstream = upstream
    this.unsubscribe = upstream.subscribe((event) => this.onUpstreamEvent(event))
    this.rebuildVisible()
    const layer = this
    return {
      getRowCount: () => layer.visibleRows.length,
      getSchema: () => upstream.getSchema(),
      getRows: (start, end) =>
        upstream.getRows(layer.visibleRows[start]!, layer.visibleRows[end]!) as Row[],
      getCell: (rowIndex, fieldId) => upstream.getCell(layer.visibleRows[rowIndex]!, fieldId),
      subscribe: (listener) => upstream.subscribe(listener),
      resolveUnderlyingRow: (viewRow) => {
        const upstreamRow = layer.visibleRows[viewRow]
        if (upstreamRow == null) return viewRow
        return upstream.resolveUnderlyingRow?.(upstreamRow) ?? upstreamRow
      },
      findViewRow: (underlyingRow) => {
        const upstreamView = upstream.findViewRow?.(underlyingRow) ?? underlyingRow
        const idx = layer.visibleRows.indexOf(upstreamView)
        return idx >= 0 ? idx : -1
      },
    }
  }

  private onUpstreamEvent(event: DataSourceEvent): void {
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
      this.rebuildVisible()
      this.notify?.({
        layerId: this.id,
        reason: event.type === 'reset' ? 'upstream-reset' : 'spec-changed',
      })
    }
  }

  private rebuildVisible(): void {
    const upstream = this.upstream
    if (upstream == null) {
      this.visibleRows = []
      return
    }
    const total = upstream.getRowCount()
    const next: number[] = []
    for (let i = 0; i < total; i += 1) {
      if (!this.hiddenUnderlyingRows.has(i)) next.push(i)
    }
    this.visibleRows = next
  }

  private makeGap(run: number[]): CollapsedGap {
    const first = run[0]!
    // atViewRow = 紧邻 hidden run 之前的最后一个 visible underlying 行在 visibleRows 中的索引
    const upperUnderlying = first - 1
    const atViewRow = upperUnderlying < 0 ? -1 : this.visibleRows.indexOf(upperUnderlying)
    return { atViewRow, hiddenCount: run.length, hiddenIds: run.slice() }
  }
}

function sameSet(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}
