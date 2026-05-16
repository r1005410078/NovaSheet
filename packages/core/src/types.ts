// 跨模块共享类型的内部 barrel——内部代码通过 `from '../types'` 统一引用，
// 减少深路径耦合。对外公开类型从 src/index.ts 导出。
export type { CellValue, Field, FieldType, Row, Schema } from './data/Schema'
