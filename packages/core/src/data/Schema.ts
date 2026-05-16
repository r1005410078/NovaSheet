/**
 * 字段类型枚举。M1 里 CellPainter 只为 text / number 实现专门绘制路径；
 * 其余 5 种全部走 fallback（toString → text）。
 * M2+ 加专属绘制 / 编辑器时只补 switch case，无需改本枚举。
 */
export type FieldType =
  | 'text'
  | 'number'
  | 'singleSelect'
  | 'multiSelect'
  | 'date'
  | 'checkbox'
  | 'url'

/** 字段定义（列元数据） */
export interface Field {
  /** 稳定 ID——M3 列重排后仍可定位字段（setColumnWidth 等 API 基于此） */
  readonly id: string
  /** 用户可见的字段名（列头显示） */
  readonly name: string
  /** 字段类型，决定渲染方式与对齐规则 */
  readonly type: FieldType
  /** 列宽（CSS 像素）。Grid 把它物化到列轴的 ChunkedAxis。 */
  width: number
  /** 列隐藏（M3+）；M1 不处理 */
  hidden?: boolean
  /** type-specific 配置，如 singleSelect 的 choices——M2+ 启用 */
  options?: Record<string, unknown>
}

/** 表格 Schema：有序字段列表 */
export interface Schema {
  readonly fields: readonly Field[]
}

/**
 * 单元格的值域。
 * - null：显式空（与 SQL 一致），渲染为空白
 * - undefined（在 DataSource.getCell 返回类型里）：异步源未加载
 * - readonly string[]：multiSelect 用
 * - Date：date 类型用，CellPainter 在 fallback 路径里取 ISO 字符串
 */
export type CellValue = string | number | boolean | null | readonly string[] | Date

/** 行：fieldId → cellValue。形如 `{ name: 'Alice', age: 30 }` */
export type Row = Record<string, CellValue>
