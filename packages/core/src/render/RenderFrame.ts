/**
 * 引擎状态快照，供 Web 渲染器消费（spec §5 `RenderFrame`）。
 *
 * 不是 renderer 无关的绘制指令流——各 renderer 仍需自行遍历可见单元格。
 * 作用是把 DOM/Canvas 类型挡在 core 之外，并统一每帧输入形状。
 */

import type { DataSource } from '../data/DataSource'
import type { Axis } from '../layout/ChunkedAxis'
import type { ViewportSnapshot } from '../layout/Viewport'
import type { Theme } from '../theme/Theme'

export interface RenderFrame {
  data: DataSource
  theme: Theme
  rowsAxis: Axis
  colsAxis: Axis
  viewport: ViewportSnapshot
}
