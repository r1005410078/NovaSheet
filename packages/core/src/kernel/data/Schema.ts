/** NovaSheet 内置字段类型。 */
export type BuiltInFieldType =
  | 'text'
  | 'number'
  | 'singleSelect'
  | 'multiSelect'
  | 'date'
  | 'checkbox'
  | 'url'

/**
 * 字段类型。内置类型有默认语义；custom string 允许插件声明业务类型。
 * 未注册 custom type 走文本显示 fallback，且不可直接编辑。
 */
export type FieldType = BuiltInFieldType | (string & {})

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
  /**
   * 文本是否换行（M3 autofit）。
   * - `false` / undefined（默认）：单行，超长用 `…` 截断（与 M2 之前行为一致）
   * - `true`：CellPainter 按 `rect.width` 词/CJK 字符边界换行；`Grid.autofitRows()` 会
   *   按当前列宽量出每行需要的总高度并写入 `rowsAxis.setSize`。
   *
   * 只有 `text` 类型（含 fallback 走 text 路径的类型）会响应 wrap；`number` 仍单行右对齐。
   */
  wrap?: boolean
  /** 列级默认值格式（Phase 5-C）；被 cell 级 CellFormat.valueFormat 覆盖。 */
  readonly format?: import('../protocol/FormatTypes').ValueFormat
  /** type-specific 配置，如 singleSelect 的 choices——M2+ 启用 */
  options?: Record<string, unknown> & {
    choices?: unknown
    /** 列级默认验证规则（可被 Grid.setValidation 区间覆盖）。 */
    validation?: import('../protocol/ValidationTypes').ValidationRule
  }
  /** 新行插入时该字段的默认值；undefined 表示空 */
  defaultValue?: CellValue
}

/** 列组树的一个子节点：嵌套子组，或指向 `fields` 中一个字段的叶引用 */
export type ColumnGroupChild = ColumnGroup | { readonly fieldId: string }

/** 多行表头的列组节点（纯注解，不影响列顺序）。校验见 `validateColumnGroups`。 */
export interface ColumnGroup {
  /** 组 ID，全树唯一 */
  readonly id: string
  /** 组头显示文本 */
  readonly label: string
  /** 子节点（嵌套组或叶字段引用），非空 */
  readonly children: readonly ColumnGroupChild[]
}

/** 表格 Schema：有序字段列表 */
export interface Schema {
  readonly fields: readonly Field[]
  /** 可选列组树。缺省 = 无组头，行为与现状完全一致。校验见 validateColumnGroups。 */
  readonly columnGroups?: readonly ColumnGroupChild[]
}

/**
 * 单元格的值域。
 * - null：显式空（与 SQL 一致），渲染为空白
 * - undefined（在 DataSource.getCell 返回类型里）：异步源未加载
 * - readonly string[]：multiSelect 用
 * - number（date 类型）：序列日期（serial date），纪元 1899-12-30 起的整数天数，与 Excel/Google Sheets 对齐
 */
export type CellValue = string | number | boolean | null | readonly string[]

/** 行：fieldId → cellValue。形如 `{ name: 'Alice', age: 30 }` */
export type Row = Record<string, CellValue>
