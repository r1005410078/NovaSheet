import type { FieldType } from '../data/Schema'

export interface IconDef {
  /** SVG path data, fits in 16x16 viewBox */
  readonly path: string
}

export interface ThemeMetrics {
  readonly rowHeight: number
  readonly headerHeight: number
  readonly cellPaddingX: number
  readonly cellPaddingY: number
  readonly fontSize: number
  readonly fontFamily: string
  readonly borderWidth: number
}

export interface ThemeColors {
  readonly background: string
  readonly headerBackground: string
  readonly text: string
  readonly headerText: string
  readonly gridLine: string
  readonly gridLineStrong: string
  readonly frozenShadow: string
  readonly hoverRowBg: string
  readonly selectionBg: string
  readonly selectionBorder: string
}

export interface ThemeCell {
  readonly textAlignByType: Readonly<Record<FieldType, CanvasTextAlign>>
  readonly tagRadius: number
  readonly tagPaddingX: number
}

export interface ThemeIcons {
  readonly byFieldType: Readonly<Record<FieldType, IconDef>>
}

export interface ThemeScrollbar {
  readonly trackWidth: number
  readonly thumbColor: string
}

export interface Theme {
  readonly metrics: ThemeMetrics
  readonly colors: ThemeColors
  readonly cell: ThemeCell
  readonly icons: ThemeIcons
  readonly scrollbar: ThemeScrollbar
}
