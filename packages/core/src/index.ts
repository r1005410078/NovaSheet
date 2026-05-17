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

