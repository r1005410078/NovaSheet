// @novasheet/core 的公开 API barrel。
// 任何不在这里 export 的符号视为内部实现，不属于半稳定契约——CLAUDE.md「What goes where」。

// 主入口
export { Grid } from './Grid'
export type { GridOptions } from './Grid'

// 数据层
export { InMemoryDataSource } from './data/InMemoryDataSource'
export type {
  CellValue,
  Field,
  FieldType,
  Row,
  Schema,
} from './data/Schema'
export type {
  DataSource,
  DataSourceEvent,
  DataSourceListener,
} from './data/DataSource'

// 主题层
export { denseGridTheme } from './theme/denseGridTheme'
export type { Theme } from './theme/Theme'

// 布局层
export { ChunkedAxis, CHUNK_SIZE } from './layout/ChunkedAxis'
export { Viewport } from './layout/Viewport'
export { FrozenRegions } from './layout/FrozenRegions'
export type { Axis, MutableAxis } from './layout/ChunkedAxis'
export type { QuadrantRect, Quadrant, Quadrants } from './layout/FrozenRegions'
export { DefaultGridEngine } from './engine/DefaultGridEngine'
export type { GridEngine, GridEngineOptions } from './engine/GridEngine'
export type { RenderFrame } from './render/RenderFrame'
export type { ViewportSnapshot } from './layout/Viewport'

// Utility — exported so @novasheet/web can share RAF scheduling
export { FrameScheduler, frameScheduler } from './util/raf'

