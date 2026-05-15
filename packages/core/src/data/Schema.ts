/** 支持的字段类型枚举 */
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
  /** 字段唯一标识符 */
  readonly id: string
  /** 列标题文本 */
  readonly name: string
  /** 字段类型，决定渲染方式与对齐规则 */
  readonly type: FieldType
  /** 列宽（CSS px） */
  width: number
  /** 是否隐藏该列 */
  hidden?: boolean
  /** 字段类型的扩展配置（如 singleSelect 的选项列表） */
  options?: Record<string, unknown>
}

/** 表格 Schema：有序字段列表 */
export interface Schema {
  readonly fields: readonly Field[]
}

/** 单元格值类型联合 */
export type CellValue = string | number | boolean | null | readonly string[] | Date

/** 一行数据：字段 id → 单元格值的映射 */
export type Row = Record<string, CellValue>
