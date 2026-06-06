import type { WebPointerEvent } from '../../host/Host'

/** 边缘自动滚动的轴向；null 表示该拖拽不自动滚动。 */
export type AutoScrollAxis = 'both' | 'horizontal' | 'vertical' | null

/**
 * 一个拖拽手势的状态机。每类拖拽（列/行表头、选区、填充柄…）实现此接口，由 runtime 统一派发。
 *
 * 收口 god-runtime 的拖拽逻辑（架构 review R1）：加新拖拽 = 实现本接口 + 注册一行，
 * 派发循环与边缘自动滚动 tick 自动认它，无需再改 runtime 的多处散点。
 */
export interface Drag {
  /** pointerdown 尝试起拖；消费事件（已起拖）返回 true。 */
  tryStart(event: WebPointerEvent): boolean
  /** pointermove；正在拖返回 true（消费，阻断后续派发）。 */
  move(event: WebPointerEvent): boolean
  /** pointerup 提交。 */
  commit(): void
  /** Escape / 中断取消（不提交）。 */
  cancel(): void
  /** 是否处于活跃拖拽（已越过起拖阈值，正在拖）。 */
  readonly active: boolean
  /** 边缘自动滚动轴向。 */
  readonly autoScrollAxis: AutoScrollAxis
  /** 自动滚动一帧后按当前 pointer 重算落点（等价于再 move 一次）。 */
  reevaluate(pointer: WebPointerEvent): void
}
