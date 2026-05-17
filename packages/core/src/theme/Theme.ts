import type { FieldType } from '../data/Schema'

/**
 * Theme 是渲染层视觉值的**唯一来源**（CLAUDE.md 不变量 #3：
 * 「Theme is the ONLY source of visual values」）。
 * render/ 下任何模块都不应出现硬编码的 px / 颜色字面量——所有数值与色值都从这里取。
 *
 * M1 内置 denseGridTheme（紧凑网格风）。M3 可加 airtableLikeTheme / notionLikeTheme
 * 作为可选 export。
 */

/** 字段类型 icon 定义。16×16 viewBox 内的 SVG path。 */
export interface IconDef {
  readonly path: string
}

/** 度量类——尺寸、字号、padding 等几何参数。 */
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

/** 色板——所有 fillStyle / strokeStyle 都从这里取。 */
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
  /** 强调网格线颜色 */
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

/** 单元格相关 token。 */
export interface ThemeCell {
  /** 按字段类型决定 ctx.textAlign。number 通常右对齐，其余左对齐。 */
  readonly textAlignByType: Readonly<Record<FieldType, CanvasTextAlign>>
  /** singleSelect/multiSelect 标签圆角与水平内边距——M2+ 使用 */
  readonly tagRadius: number
  /** 标签徽章水平内边距（px） */
  readonly tagPaddingX: number
}

/** 列头 icon 表——按字段类型取对应 SVG path。 */
export interface ThemeIcons {
  /** 各字段类型对应的图标定义 */
  readonly byFieldType: Readonly<Record<FieldType, IconDef>>
}

/** 滚动条样式（M2 引入 NativeScroller 后启用）。 */
export interface ThemeScrollbar {
  /** 滚动条轨道宽度（px） */
  readonly trackWidth: number
  /** 滚动条滑块颜色 */
  readonly thumbColor: string
}

/** 冻结行列边界线样式。 */
export interface ThemeFrozenSeparator {
  /** 冻结边界线颜色 */
  readonly color: string
  /** 冻结边界线宽度（px） */
  readonly width: number
}

/** 完整主题定义接口，所有视觉值必须从此处读取，禁止在 src/render/ 内硬编码 */
export interface Theme {
  readonly metrics: ThemeMetrics
  readonly colors: ThemeColors
  readonly cell: ThemeCell
  readonly icons: ThemeIcons
  readonly scrollbar: ThemeScrollbar
  readonly frozenSeparator: ThemeFrozenSeparator
}
