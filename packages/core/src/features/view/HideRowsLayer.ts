import { isMutableDataSource } from '../../kernel/data/MutableDataSource'
import type { MutableDataSource } from '../../kernel/data/MutableDataSource'
import type { DataSource, DataSourceEvent, DataSourceListener } from '../../kernel/data/DataSource'
import type { Row } from '../../kernel/data/Schema'
import type { CollapsedGap } from '../../kernel/render/RenderTypes'
import type { ViewLayer, ViewLayerChange } from './ViewLayer'

export type { CollapsedGap } from '../../kernel/render/RenderTypes'

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
    const upstream = this.currentUpstream
    if (upstream == null) return []
    const visible = this.visibleRows
    const total = upstream.getRowCount()
    const toUnderlying = (pos: number): number => upstream.resolveUnderlyingRow?.(pos) ?? pos
    const collectHidden = (fromPos: number, toPos: number): number[] => {
      const ids: number[] = []
      for (let pos = fromPos; pos < toPos; pos++) ids.push(toUnderlying(pos))
      return ids
    }
    const gaps: CollapsedGap[] = []

    // 顶部隐藏段：首个可见 upstream 位置之前的位置全被隐藏
    const firstVisible = visible.length > 0 ? visible[0]! : total
    if (firstVisible > 0) {
      const hiddenIds = collectHidden(0, firstVisible)
      gaps.push({ atViewRow: -1, hiddenCount: hiddenIds.length, hiddenIds })
    }

    // 中段：相邻可见位置间的跳变即隐藏段
    for (let k = 0; k < visible.length - 1; k++) {
      const prev = visible[k]!
      const cur = visible[k + 1]!
      if (cur > prev + 1) {
        const hiddenIds = collectHidden(prev + 1, cur)
        gaps.push({ atViewRow: k, hiddenCount: hiddenIds.length, hiddenIds })
      }
    }

    // 末尾隐藏段：末个可见位置之后的位置全被隐藏
    if (visible.length > 0) {
      const lastVisible = visible[visible.length - 1]!
      if (lastVisible < total - 1) {
        const hiddenIds = collectHidden(lastVisible + 1, total)
        gaps.push({ atViewRow: visible.length - 1, hiddenCount: hiddenIds.length, hiddenIds })
      }
    }

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
    // 若在 upstream 自己 emit() 的活 for-of 遍历（其 listeners Set）尚未展开完时构造一个新
    // HiddenDataSource（如 DefaultRowStructure.rebuild() 同步跑在事件监听器里），这里的订阅会被
    // 同一次遍历继续访问到——JS Set/for-of 会看到遍历期间新增的项。若监听器对该事件的反应又是
    // 同步再包一层（再次订阅），则无限递归（DefaultGridEngine 的 rowCountChanged/reset 桥接曾在
    // 2026-07-05 windowed-data-source 审查中踩到这个坑，见 DefaultGridEngine.scheduleDataRebuild）。
    // 不要在 DataSourceEvent 监听器里同步做 rebuildData 等价操作——需要反应就 queueMicrotask。
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

  // 参数名用 `win` 而非 `window`：lint:architecture 的 DOM_GLOBAL_RE 朴素正则匹配
  // 全局对象成员访问前缀，无法区分局部遮蔽与真实 DOM 全局（同 blockGeometry.ts 先例）。
  hintWindow(win: import('../../kernel/data/DataSource').DataWindow): void {
    if (!this.upstream.hintWindow) return
    const visibleRows = this.layer.getVisibleRows()
    let minRaw = Infinity
    let maxRaw = -Infinity
    for (let viewRow = win.startRow; viewRow <= win.endRow; viewRow += 1) {
      const upstreamRow = visibleRows[viewRow]
      if (upstreamRow == null) continue
      const raw = this.upstream.resolveUnderlyingRow?.(upstreamRow) ?? upstreamRow
      if (raw < minRaw) minRaw = raw
      if (raw > maxRaw) maxRaw = raw
    }
    if (minRaw > maxRaw) return
    this.upstream.hintWindow({
      startRow: minRaw,
      endRow: maxRaw,
      startCol: win.startCol,
      endCol: win.endCol,
    })
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
