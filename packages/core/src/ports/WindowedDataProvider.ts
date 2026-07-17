import type { CellValue, Row } from '../kernel/data/Schema'
import type { DataWindow } from '../kernel/data/DataSource'

export type { DataWindow } from '../kernel/data/DataSource'

/** 单元格推送更新。行按 raw 行号，列按 fieldId 锚定（与全仓 cell 值锚定惯例一致）。 */
export interface CellUpdate {
  readonly row: number
  readonly fieldId: string
  readonly value: CellValue
}

/** loadRange 响应切片。 */
export interface RangeSlice {
  /** 与 [startRow..endRow] 位置对齐（rows[i] = 第 startRow+i 行），行内至少含窗口列区间覆盖的字段。 */
  readonly rows: readonly Row[]
  /** 响应时刻的总行数——结构漂移（删/增行）检测通道，强烈建议每次都带。 */
  readonly rowCount?: number
  /** 可选单调数据版本；提供则 epoch 判定精确（乱序/陈旧响应可甄别丢弃）。 */
  readonly version?: number
}

/**
 * Provider → WindowedDataSource 推送事件。
 *
 * 通道红线（误用会导致主线程卡顿甚至假死）：
 * - `cells`：定时刷新 / WS 推送的**默认**通道；只改已缓存块，不清库
 * - `rowCount` / `invalidate`：结构漂移或快照软失效；标 stale 后重拉窗口，旧值过渡
 * - `resync`：**仅**断线重连或确认丢推送；清全部缓存并重拉。禁止用于周期性全量刷新
 */
export type WindowedDataEvent =
  | { type: 'cells'; updates: readonly CellUpdate[] }
  | { type: 'rowCount'; rowCount: number; version?: number }
  /** 软失效：markAllStale + 重拉当前预取窗口，不清空缓存（快照轮询可用）。 */
  | { type: 'invalidate' }
  | { type: 'resync'; rowCount?: number }

export interface WindowSubscription {
  /** WindowedDataSource 滚动防抖后调用，告知服务端新的订阅窗口。 */
  setWindow(window: DataWindow): void
  close(): void
}

export interface WindowedDataProvider {
  /**
   * 拉取矩形区间。
   *
   * 实现必须 O(窗口)：只物化 `[startRow..endRow] × [startCol..endCol]`。
   * 禁止先构建全表再 slice——大表下会被预取多块并发打满主线程。
   */
  loadRange(window: DataWindow, signal: AbortSignal): Promise<RangeSlice>
  /**
   * 建立推送通道（典型 WebSocket），返回可变窗口的订阅句柄；构造 WindowedDataSource 时调用一次。
   * 定时换数请对当前 `setWindow` 发 `cells`，不要发 `resync`。
   */
  subscribe(onEvent: (event: WindowedDataEvent) => void): WindowSubscription
}
