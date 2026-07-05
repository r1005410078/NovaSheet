import type { CellValue, Row } from '../Schema'
import type { DataWindow } from '../DataSource'

export type { DataWindow } from '../DataSource'

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

export type WindowedDataEvent =
  | { type: 'cells'; updates: readonly CellUpdate[] }
  | { type: 'rowCount'; rowCount: number; version?: number }
  | { type: 'resync'; rowCount?: number }

export interface WindowSubscription {
  /** WindowedDataSource 滚动防抖后调用，告知服务端新的订阅窗口。 */
  setWindow(window: DataWindow): void
  close(): void
}

export interface WindowedDataProvider {
  /** 拉取矩形区间。 */
  loadRange(window: DataWindow, signal: AbortSignal): Promise<RangeSlice>
  /** 建立推送通道（典型 WebSocket），返回可变窗口的订阅句柄；构造 WindowedDataSource 时调用一次。 */
  subscribe(onEvent: (event: WindowedDataEvent) => void): WindowSubscription
}
