import type { FieldType } from '../data/Schema'

/** 图标定义（SVG path 数据，适用于 16×16 viewBox） */
export interface IconDef {
  /** SVG path 路径数据 */
  readonly path: string
}

/** 尺寸度量 token */
export interface ThemeMetrics {
  /** 默认行高（px） */
  readonly rowHeight: number
  /** 表头高度（px） */
  readonly headerHeight: number
  /** 单元格水平内边距（px） */
  readonly cellPaddingX: number
  /** 单元格垂直内边距（px） */
  readonly cellPaddingY: number
  /** 字体大小（px） */
  readonly fontSize: number
  /** 字体族 */
  readonly fontFamily: string
  /** 网格线宽度（px） */
  readonly borderWidth: number
}

/** 颜色 token */
export interface ThemeColors {
  /** 内容区背景色 */
  readonly background: string
  /** 表头背景色 */
  readonly headerBackground: string
  /** 单元格文字颜色 */
  readonly text: string
  /** 表头文字颜色 */
  readonly headerText: string
  /** 普通网格线颜色 */
  readonly gridLine: string
  /** 强调网格线颜色（冻结边界等） */
  readonly gridLineStrong: string
  /** 冻结区阴影颜色 */
  readonly frozenShadow: string
  /** 行悬停背景色（M4） */
  readonly hoverRowBg: string
  /** 选区背景色（M4） */
  readonly selectionBg: string
  /** 选区边框颜色（M4） */
  readonly selectionBorder: string
}

/** 单元格渲染 token */
export interface ThemeCell {
  /** 各字段类型的文本对齐方式 */
  readonly textAlignByType: Readonly<Record<FieldType, CanvasTextAlign>>
  /** 标签徽章圆角半径（px） */
  readonly tagRadius: number
  /** 标签徽章水平内边距（px） */
  readonly tagPaddingX: number
}

/** 图标 token */
export interface ThemeIcons {
  /** 各字段类型对应的图标定义 */
  readonly byFieldType: Readonly<Record<FieldType, IconDef>>
}

/** 滚动条 token（M2 NativeScroller 使用） */
export interface ThemeScrollbar {
  /** 滚动条轨道宽度（px） */
  readonly trackWidth: number
  /** 滚动条滑块颜色 */
  readonly thumbColor: string
}

/** 完整主题定义接口，所有视觉值必须从此处读取，禁止在 src/render/ 内硬编码 */
export interface Theme {
  readonly metrics: ThemeMetrics
  readonly colors: ThemeColors
  readonly cell: ThemeCell
  readonly icons: ThemeIcons
  readonly scrollbar: ThemeScrollbar
}
