import type { CellRange } from '../interaction/SelectionModel'

export type BorderWidth = 'thin' | 'medium' | 'thick'
export type BorderLineStyle = 'solid' | 'dashed' | 'dotted' | 'double'
export type BorderPreset = 'all' | 'outer' | 'inner' | 'clear'

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

export interface CellFormat {
  readonly fillColor?: string
  readonly borders?: CellBorders
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
  readonly order: number
}
