/**
 * RenderFrame — engine state snapshot consumed by web renderers (Canvas2D,
 * WebGL, ...). NOT a renderer-agnostic command stream — each renderer still
 * iterates visible cells and translates to its own draw primitives (spec §5).
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
