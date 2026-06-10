import type { CellRange } from '../coords/SelectionTypes'
import type { CellValue, Field } from '../data/Schema'

/** 值格式化描述符（可序列化）。`custom` 指向 GridOptions.formatters 注册表。 */
export type ValueFormat =
  | { readonly kind: 'number'; readonly decimals?: number; readonly thousands?: boolean }
  | { readonly kind: 'currency'; readonly currency: string; readonly decimals?: number; readonly locale?: string }
  | { readonly kind: 'percent'; readonly decimals?: number }
  | { readonly kind: 'date'; readonly pattern: string }
  | { readonly kind: 'custom'; readonly formatterId: string }

/** 自定义 formatter 上下文（纯、同步、无 DOM）。 */
export interface FormatContext {
  readonly field: Field
  readonly locale: string
}

/** 集成方自定义 formatter：raw value → 显示文本。必须纯 + 同步 + 快 + 只返 string。 */
export type CellFormatter = (value: CellValue, ctx: FormatContext) => string

export type BorderWidth = 'thin' | 'medium' | 'thick'
export type BorderLineStyle = 'solid' | 'dashed' | 'dotted' | 'double'
export type BorderPreset =
  | 'all'
  | 'outer'
  | 'inner'
  | 'innerHorizontal'
  | 'innerVertical'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'clear'

export interface BorderStyle {
  readonly color: string
  readonly width: BorderWidth
  readonly lineStyle: BorderLineStyle
}

export interface CellBorders {
  readonly top?: BorderStyle
  readonly right?: BorderStyle
  readonly bottom?: BorderStyle
  readonly left?: BorderStyle
}

/** 文本显示三态（对齐 Google/Excel）：溢出到邻空格 / 软折 / 硬裁断。缺省视为 `overflow`。 */
export type TextWrapMode = 'overflow' | 'wrap' | 'clip'

export interface CellFormat {
  readonly fillColor?: string
  readonly borders?: CellBorders
  readonly textWrap?: TextWrapMode
  readonly valueFormat?: ValueFormat
}

export interface ResolvedCellFormat {
  readonly rowIndex: number
  readonly colIndex: number
  readonly format: CellFormat
}

export interface FormatLayer {
  readonly range: CellRange
  readonly patch: CellFormat
  readonly clearFill?: boolean
  /** When true, clears `borders` accumulated from prior layers for covered cells. */
  readonly clearBorders?: boolean
  /** 单层边框：覆盖整个 range，边缘归属在 resolveCell 读时按 preset+位置解析。 */
  readonly borderPreset?: Exclude<BorderPreset, 'clear'>
  readonly borderStyle?: BorderStyle
  readonly order: number
}
