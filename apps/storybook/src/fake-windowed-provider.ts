/**
 * FakeWindowedProvider stands in for a real WindowedDataProvider backend
 * (HTTP + WebSocket) for the Storybook demo: `loadRange` resolves after a
 * simulated network delay, and `subscribe` pushes a batch of cell updates on
 * a short interval — tick-by-tick market-data style — to stand in for a live
 * WebSocket feed on the subscribed window.
 *
 * Demo helper only — not shipped from @zhiguang/novasheet-core.
 */

import type {
  CellUpdate,
  CellValue,
  DataWindow,
  RangeSlice,
  Row,
  Schema,
  WindowedDataEvent,
  WindowedDataProvider,
  WindowSubscription,
} from '@zhiguang/novasheet-core'

export type FakeCellGenerator = (row: number, fieldId: string) => CellValue

export interface FakeWindowedProviderOptions {
  readonly schema: Schema
  readonly rowCount: number
  readonly cellFn: FakeCellGenerator
  readonly latencyMs?: number
  /** Tick interval in ms — how often a push batch fires. Default 150ms (~6-7 ticks/sec). */
  readonly pushIntervalMs?: number
  /** Cell updates bundled into a single `cells` event per tick. Default 8. */
  readonly pushBatchSize?: number
  readonly onActivity?: (message: string) => void
}

export class FakeWindowedProvider implements WindowedDataProvider {
  private readonly schema: Schema
  private readonly rowCount: number
  private readonly cellFn: FakeCellGenerator
  private readonly latencyMs: number
  private readonly pushIntervalMs: number
  private readonly pushBatchSize: number
  private readonly onActivity: (message: string) => void
  private currentWindow: DataWindow | null = null
  private tickSeq = 0

  constructor(options: FakeWindowedProviderOptions) {
    this.schema = options.schema
    this.rowCount = options.rowCount
    this.cellFn = options.cellFn
    this.latencyMs = options.latencyMs ?? 400
    this.pushIntervalMs = options.pushIntervalMs ?? 150
    this.pushBatchSize = options.pushBatchSize ?? 8
    this.onActivity = options.onActivity ?? (() => {})
  }

  loadRange(window: DataWindow, signal: AbortSignal): Promise<RangeSlice> {
    this.onActivity(`↓ loadRange rows ${window.startRow}-${window.endRow}`)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const rows: Row[] = []
        for (let r = window.startRow; r <= window.endRow; r += 1) {
          const row: Row = {}
          this.schema.fields.forEach((field, col) => {
            if (col >= window.startCol && col <= window.endCol) row[field.id] = this.cellFn(r, field.id)
          })
          rows.push(row)
        }
        resolve({ rows, rowCount: this.rowCount })
      }, this.latencyMs)
      signal.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(new DOMException('aborted', 'AbortError'))
      })
    })
  }

  subscribe(onEvent: (event: WindowedDataEvent) => void): WindowSubscription {
    const timer = setInterval(() => {
      const win = this.currentWindow
      if (!win) return
      const updates: CellUpdate[] = []
      for (let i = 0; i < this.pushBatchSize; i += 1) {
        const row = win.startRow + Math.floor(Math.random() * (win.endRow - win.startRow + 1))
        const col = win.startCol + Math.floor(Math.random() * (win.endCol - win.startCol + 1))
        const field = this.schema.fields[col]
        if (!field) continue
        updates.push({ row, fieldId: field.id, value: this.cellFn(row, field.id) })
      }
      if (updates.length === 0) return
      this.tickSeq += 1
      this.onActivity(`↑ tick #${this.tickSeq} · ${updates.length} cells`)
      onEvent({ type: 'cells', updates })
    }, this.pushIntervalMs)

    return {
      setWindow: (window) => {
        this.currentWindow = window
        this.onActivity(`⟳ subscribe window rows ${window.startRow}-${window.endRow}`)
      },
      close: () => clearInterval(timer),
    }
  }
}
