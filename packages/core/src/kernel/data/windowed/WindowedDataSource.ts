import type {
  DataSource,
  DataSourceEvent,
  DataSourceListener,
  DataWindow,
} from '../DataSource'
import type { CellValue, Row, Schema } from '../Schema'
import {
  blockKey,
  expandWindow,
  mergeBlocksIntoRects,
  windowsEqual,
  windowToBlocks,
  type BlockCoord,
} from './blockGeometry'
import { BlockCache } from './BlockCache'
import { applySliceToBlocks } from './sliceToBlocks'
import type {
  CellUpdate,
  RangeSlice,
  WindowedDataEvent,
  WindowedDataProvider,
  WindowSubscription,
} from '../../../ports/WindowedDataProvider'

export interface WindowedDataSourceOptions {
  readonly schema: Schema
  readonly rowCount: number
  readonly provider: WindowedDataProvider
  readonly preloadScreens?: number
  readonly blockRows?: number
  readonly blockCols?: number
  readonly maxCachedBlocks?: number
  readonly subscribeDebounceMs?: number
  readonly staleAfterMs?: number
}

interface InFlightRequest {
  readonly controller: AbortController
  readonly blockKeys: readonly string[]
  readonly rect: DataWindow
  readonly blocks: readonly BlockCoord[]
  readonly pendingByBlock: Map<string, CellUpdate[]>
}

export class WindowedDataSource implements DataSource {
  private schema: Schema
  private rowCount: number
  private currentVersion: number | undefined
  private readonly provider: WindowedDataProvider
  private readonly preloadScreens: number
  private readonly blockRowsSize: number
  private readonly blockColsSize: number
  private readonly subscribeDebounceMs: number
  private readonly staleAfterMs: number
  private readonly cache: BlockCache
  private readonly fieldIdToCol = new Map<string, number>()
  private readonly listeners = new Set<DataSourceListener>()
  private subscription: WindowSubscription | null = null
  private subscribeTimer: ReturnType<typeof setTimeout> | null = null
  private disposed = false
  private lastHintWindow: DataWindow | null = null

  private readonly requests = new Map<string, InFlightRequest>()
  private readonly inFlightByBlock = new Map<string, string>()
  private readonly cooldownUntil = new Map<string, number>()
  private requestSeq = 0

  private pendingChangedRange: { minRow: number; maxRow: number } | null = null
  private flushScheduled = false

  constructor(options: WindowedDataSourceOptions) {
    this.schema = options.schema
    this.rowCount = options.rowCount
    this.provider = options.provider
    this.preloadScreens = options.preloadScreens ?? 2
    this.blockRowsSize = options.blockRows ?? 128
    this.blockColsSize = options.blockCols ?? 16
    this.subscribeDebounceMs = options.subscribeDebounceMs ?? 150
    this.staleAfterMs = options.staleAfterMs ?? 30_000
    this.cache = new BlockCache({ maxCachedBlocks: options.maxCachedBlocks ?? 256 })
    this.schema.fields.forEach((field, index) => this.fieldIdToCol.set(field.id, index))

    try {
      this.subscription = this.provider.subscribe((event) => this.handleEvent(event))
    } catch (error) {
      console.warn('[WindowedDataSource] provider.subscribe threw; falling back to fetch-only mode', error)
      this.subscription = null
    }
  }

  getRowCount(): number {
    return this.rowCount
  }

  getSchema(): Schema {
    return this.schema
  }

  getCell(rowIndex: number, fieldId: string): CellValue | undefined {
    const col = this.fieldIdToCol.get(fieldId)
    if (col === undefined) return undefined
    const blockRow = Math.floor(rowIndex / this.blockRowsSize)
    const blockCol = Math.floor(col / this.blockColsSize)
    const localRow = rowIndex - blockRow * this.blockRowsSize
    const localCol = col - blockCol * this.blockColsSize
    return this.cache.get(blockKey(blockRow, blockCol), localRow, localCol)
  }

  getRows(startIndex: number, endIndex: number): Row[] {
    const start = Math.max(0, startIndex)
    const end = Math.min(this.rowCount - 1, endIndex)
    if (end < start) return []
    const rows: Row[] = []
    for (let row = start; row <= end; row += 1) {
      const record: Row = {}
      for (const field of this.schema.fields) {
        const value = this.getCell(row, field.id)
        if (value !== undefined) record[field.id] = value
      }
      rows.push(record)
    }
    return rows
  }

  resolveUnderlyingRow(viewRow: number): number {
    return viewRow
  }

  findViewRow(underlyingRow: number): number {
    return underlyingRow
  }

  subscribe(listener: DataSourceListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  hintWindow(window: DataWindow): void {
    if (this.disposed) return
    if (windowsEqual(window, this.lastHintWindow)) return
    this.lastHintWindow = window
    this.planAndFetch(window)
    this.scheduleSubscriptionFollow(window)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.subscribeTimer !== null) clearTimeout(this.subscribeTimer)
    this.subscription?.close()
    for (const request of this.requests.values()) request.controller.abort()
    this.requests.clear()
    this.inFlightByBlock.clear()
    this.cooldownUntil.clear()
    this.cache.clear()
  }

  private planAndFetch(visibleWindow: DataWindow): void {
    const colCount = this.schema.fields.length
    const preloadWindow = expandWindow(visibleWindow, this.preloadScreens, this.rowCount, colCount)
    const allBlocks = windowToBlocks(preloadWindow, this.blockRowsSize, this.blockColsSize)
    const allKeys = new Set(allBlocks.map((b) => blockKey(b.blockRow, b.blockCol)))

    for (const [requestId, request] of this.requests) {
      const stillRelevant = request.blockKeys.some((key) => allKeys.has(key))
      if (!stillRelevant) {
        request.controller.abort()
        this.requests.delete(requestId)
        for (const key of request.blockKeys) this.inFlightByBlock.delete(key)
      }
    }

    const now = Date.now()
    const needed = allBlocks.filter((b) => {
      const key = blockKey(b.blockRow, b.blockCol)
      if (this.inFlightByBlock.has(key)) return false
      const cooldown = this.cooldownUntil.get(key)
      if (cooldown !== undefined && cooldown > now) return false
      if (!this.cache.has(key)) return true
      const freshAt = this.cache.getFreshAt(key) ?? 0
      return this.cache.isStale(key) || now - freshAt > this.staleAfterMs
    })

    if (needed.length > 0) {
      const groups = mergeBlocksIntoRects(needed, this.blockRowsSize, this.blockColsSize, this.rowCount, colCount)
      for (const group of groups) this.issueRequest(group.window, group.blocks)
    }

    this.cache.evictExcess(allKeys)
  }

  private issueRequest(rect: DataWindow, blocks: readonly BlockCoord[]): void {
    const requestId = `r${this.requestSeq}`
    this.requestSeq += 1
    const controller = new AbortController()
    const blockKeys = blocks.map((b) => blockKey(b.blockRow, b.blockCol))
    const pendingByBlock = new Map<string, CellUpdate[]>()
    for (const key of blockKeys) {
      this.inFlightByBlock.set(key, requestId)
      pendingByBlock.set(key, [])
    }
    this.requests.set(requestId, { controller, blockKeys, rect, blocks, pendingByBlock })

    this.provider.loadRange(rect, controller.signal).then(
      (slice) => this.handleResolve(requestId, slice),
      (error) => this.handleReject(requestId, error),
    )
  }

  private handleResolve(requestId: string, slice: RangeSlice): void {
    if (this.disposed) return
    const request = this.requests.get(requestId)
    if (!request) return
    this.requests.delete(requestId)
    for (const key of request.blockKeys) this.inFlightByBlock.delete(key)

    const epochResult = this.applyEpoch(slice)
    if (epochResult === 'stale') return

    const now = Date.now()
    const colCount = this.schema.fields.length
    applySliceToBlocks(
      this.cache,
      request.rect,
      request.blocks,
      slice,
      this.schema,
      this.blockRowsSize,
      this.blockColsSize,
      this.rowCount,
      colCount,
      now,
    )

    for (const [key, updates] of request.pendingByBlock) {
      for (const update of updates) this.writeCellUpdateIntoCache(key, update, now)
    }

    this.emitRowsChanged(request.rect.startRow, request.rect.endRow)

    if (epochResult === 'invalidated' && this.lastHintWindow) this.planAndFetch(this.lastHintWindow)
  }

  private handleReject(requestId: string, error: unknown): void {
    if (this.disposed) return
    const request = this.requests.get(requestId)
    if (!request) return
    this.requests.delete(requestId)
    for (const key of request.blockKeys) this.inFlightByBlock.delete(key)
    if (error instanceof Error && error.name === 'AbortError') return

    const until = Date.now() + 2000
    for (const key of request.blockKeys) this.cooldownUntil.set(key, until)
    setTimeout(() => {
      if (this.disposed) return
      if (this.lastHintWindow) this.planAndFetch(this.lastHintWindow)
    }, 2000)
  }

  private applyEpoch(slice: RangeSlice): 'stale' | 'invalidated' | 'normal' {
    if (slice.version !== undefined && this.currentVersion !== undefined && slice.version < this.currentVersion) {
      return 'stale'
    }
    const versionAdvanced = slice.version !== undefined && slice.version !== this.currentVersion
    const rowCountChanged = slice.rowCount !== undefined && slice.rowCount !== this.rowCount
    if (slice.version !== undefined) this.currentVersion = slice.version

    // rowCountChanged 是独立探测通道（RangeSlice.rowCount 文档承诺）：即使 version 存在且未变，
    // rowCount 独立漂移也必须触发软失效——不能被 "slice.version === undefined" 短路掉。
    if (versionAdvanced || rowCountChanged) {
      if (rowCountChanged) {
        this.rowCount = slice.rowCount!
        this.cache.markAllStale()
        this.emit({ type: 'rowCountChanged', newCount: this.rowCount })
      } else {
        this.cache.markAllStale()
      }
      return 'invalidated'
    }
    return 'normal'
  }

  private writeCellUpdateIntoCache(_unused: string, update: CellUpdate, nowMs: number): void {
    const col = this.fieldIdToCol.get(update.fieldId)
    if (col === undefined) return
    const blockRow = Math.floor(update.row / this.blockRowsSize)
    const blockCol = Math.floor(col / this.blockColsSize)
    const key = blockKey(blockRow, blockCol)
    if (!this.cache.has(key)) return
    const localRow = update.row - blockRow * this.blockRowsSize
    const localCol = col - blockCol * this.blockColsSize
    this.cache.setCell(key, localRow, localCol, update.value)
    this.cache.refreshFreshness(key, nowMs)
  }

  private scheduleSubscriptionFollow(window: DataWindow): void {
    if (this.subscribeTimer !== null) clearTimeout(this.subscribeTimer)
    this.subscribeTimer = setTimeout(() => {
      this.subscribeTimer = null
      if (this.disposed) return
      this.subscription?.setWindow(window)
    }, this.subscribeDebounceMs)
  }

  private emitRowsChanged(startRow: number, endRow: number): void {
    this.pendingChangedRange = this.pendingChangedRange
      ? {
          minRow: Math.min(this.pendingChangedRange.minRow, startRow),
          maxRow: Math.max(this.pendingChangedRange.maxRow, endRow),
        }
      : { minRow: startRow, maxRow: endRow }

    if (this.flushScheduled) return
    this.flushScheduled = true
    queueMicrotask(() => {
      this.flushScheduled = false
      const range = this.pendingChangedRange
      this.pendingChangedRange = null
      if (range && !this.disposed) {
        this.emit({ type: 'rowsChanged', startIndex: range.minRow, endIndex: range.maxRow })
      }
    })
  }

  private emit(event: DataSourceEvent): void {
    if (this.disposed) return
    for (const listener of this.listeners) listener(event)
  }

  private handleEvent(event: WindowedDataEvent): void {
    if (this.disposed) return
    try {
      if (event.type === 'cells') {
        this.handleCellsEvent(event.updates)
        return
      }
      if (event.type === 'rowCount') {
        this.handleRowCountEvent(event.rowCount, event.version)
        return
      }
      this.handleResyncEvent(event.rowCount)
    } catch (error) {
      console.warn('[WindowedDataSource] error handling provider event', error)
    }
  }

  private handleCellsEvent(updates: readonly CellUpdate[]): void {
    const now = Date.now()
    let touched: { minRow: number; maxRow: number } | null = null
    for (const update of updates) {
      const col = this.fieldIdToCol.get(update.fieldId)
      if (col === undefined) continue
      const blockRow = Math.floor(update.row / this.blockRowsSize)
      const blockCol = Math.floor(col / this.blockColsSize)
      const key = blockKey(blockRow, blockCol)
      const inFlightRequestId = this.inFlightByBlock.get(key)
      if (inFlightRequestId !== undefined) {
        this.requests.get(inFlightRequestId)?.pendingByBlock.get(key)?.push(update)
        continue
      }
      if (!this.cache.has(key)) continue
      this.writeCellUpdateIntoCache(key, update, now)
      touched = touched
        ? { minRow: Math.min(touched.minRow, update.row), maxRow: Math.max(touched.maxRow, update.row) }
        : { minRow: update.row, maxRow: update.row }
    }
    if (touched) this.emitRowsChanged(touched.minRow, touched.maxRow)
  }

  private handleRowCountEvent(rowCount: number, version?: number): void {
    if (version !== undefined) this.currentVersion = version
    const changed = rowCount !== this.rowCount
    this.cache.markAllStale()
    if (changed) {
      this.rowCount = rowCount
      this.emit({ type: 'rowCountChanged', newCount: rowCount })
    }
    if (this.lastHintWindow) this.planAndFetch(this.lastHintWindow)
  }

  private handleResyncEvent(rowCount?: number): void {
    for (const request of this.requests.values()) request.controller.abort()
    this.requests.clear()
    this.inFlightByBlock.clear()
    this.cooldownUntil.clear()
    this.cache.clear()

    if (rowCount !== undefined && rowCount !== this.rowCount) {
      this.rowCount = rowCount
      this.emit({ type: 'rowCountChanged', newCount: rowCount })
    }
    this.emit({ type: 'reset' })
    if (this.lastHintWindow) this.planAndFetch(this.lastHintWindow)
  }
}
