import type { CellValue, Row, Schema } from '../Schema'
import type { DataWindow } from '../DataSource'
import type {
  CellUpdate,
  RangeSlice,
  WindowedDataEvent,
  WindowedDataProvider,
  WindowSubscription,
} from '../../../ports/WindowedDataProvider'

export type SnapshotCellReader = (row: number, fieldId: string) => CellValue

export interface SnapshotWindowedProviderOptions {
  readonly schema: Schema
  readonly rowCount: number
  /** 同步读格；loadRange / pushWindowCells 共用。 */
  readonly getCell: SnapshotCellReader
}

/**
 * 官方快照型 WindowedDataProvider：定时换数走 cells，断线才 resync。
 *
 * - `loadRange` 只物化请求窗口（O(窗口)）
 * - `replaceSnapshot` / `pushWindowCells` → `{ type: 'cells' }`
 * - `invalidate` → 软失效重拉
 * - `reconnect` → 硬 `resync`（勿用于 poll）
 */
export interface SnapshotWindowedProvider extends WindowedDataProvider {
  /** 换快照读取器并推送当前订阅窗口 cells。 */
  replaceSnapshot(getCell: SnapshotCellReader, rowCount?: number): void
  /** 仅对当前 setWindow 窗口发 cells。 */
  pushWindowCells(): void
  /** 软失效：不清缓存。 */
  invalidate(): void
  /** 硬失效：仅断线重连。 */
  reconnect(rowCount?: number): void
  getRowCount(): number
}

/**
 * @param options schema / 行数 / getCell
 * @returns 带 push/invalidate/reconnect 的 provider
 */
export function createSnapshotWindowedProvider(
  options: SnapshotWindowedProviderOptions,
): SnapshotWindowedProvider {
  const schema = options.schema
  let rowCount = options.rowCount
  let getCell = options.getCell
  let onEvent: ((event: WindowedDataEvent) => void) | null = null
  let currentWindow: DataWindow | null = null

  async function loadRange(requestedWindow: DataWindow, _signal: AbortSignal): Promise<RangeSlice> {
    const startRow = Math.max(0, requestedWindow.startRow)
    const endRow = Math.min(rowCount - 1, requestedWindow.endRow)
    const startCol = Math.max(0, requestedWindow.startCol)
    const endCol = Math.min(schema.fields.length - 1, requestedWindow.endCol)
    const rows: Row[] = []

    if (rowCount <= 0 || startRow > endRow || startCol > endCol || schema.fields.length === 0) {
      return { rows, rowCount }
    }

    for (let r = startRow; r <= endRow; r += 1) {
      const row: Record<string, CellValue> = {}
      for (let c = startCol; c <= endCol; c += 1) {
        const field = schema.fields[c]!
        row[field.id] = getCell(r, field.id)
      }
      rows.push(row)
    }
    return { rows, rowCount }
  }

  function subscribe(listener: (event: WindowedDataEvent) => void): WindowSubscription {
    onEvent = typeof listener === 'function' ? listener : null
    return {
      setWindow(nextWindow) {
        currentWindow = nextWindow
      },
      close() {
        onEvent = null
        currentWindow = null
      },
    }
  }

  function pushWindowCells(): void {
    if (!onEvent || !currentWindow || schema.fields.length === 0 || rowCount <= 0) return
    const startRow = Math.max(0, currentWindow.startRow)
    const endRow = Math.min(rowCount - 1, currentWindow.endRow)
    const startCol = Math.max(0, currentWindow.startCol)
    const endCol = Math.min(schema.fields.length - 1, currentWindow.endCol)
    if (startRow > endRow || startCol > endCol) return

    const updates: CellUpdate[] = []
    for (let r = startRow; r <= endRow; r += 1) {
      for (let c = startCol; c <= endCol; c += 1) {
        const field = schema.fields[c]!
        updates.push({ row: r, fieldId: field.id, value: getCell(r, field.id) })
      }
    }
    if (updates.length) onEvent({ type: 'cells', updates })
  }

  function replaceSnapshot(nextGetCell: SnapshotCellReader, nextRowCount?: number): void {
    getCell = nextGetCell
    if (typeof nextRowCount === 'number' && nextRowCount !== rowCount) {
      rowCount = nextRowCount
      onEvent?.({ type: 'rowCount', rowCount })
    }
    pushWindowCells()
  }

  function invalidate(): void {
    onEvent?.({ type: 'invalidate' })
  }

  function reconnect(nextRowCount?: number): void {
    if (typeof nextRowCount === 'number') rowCount = nextRowCount
    onEvent?.({ type: 'resync', rowCount })
  }

  return {
    loadRange,
    subscribe,
    replaceSnapshot,
    pushWindowCells,
    invalidate,
    reconnect,
    getRowCount: () => rowCount,
  }
}
