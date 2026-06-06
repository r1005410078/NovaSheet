import type { CellRange } from '../features/selection/SelectionTypes'

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
  readonly order: number
}
