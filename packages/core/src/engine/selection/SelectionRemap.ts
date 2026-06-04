import type {
  CellAddress,
  CellRange,
  GridSelection,
} from '../../interaction/SelectionModel'

/** 结构变化前后的行/列映射能力；selection remap 只依赖显式映射函数。 */
export interface SelectionRemapContext {
  rawRowToView(rawRow: number): number
  viewRowToRawBefore(viewRow: number): number
  visibleFieldIdBefore(viewCol: number): string | undefined
  viewColByFieldIdAfter(fieldId: string): number | undefined
}

/** 选区重映射规则的输出；`null` 表示原选区已不可恢复，应清空或退回单格。 */
export interface SelectionRemapResult {
  readonly selection: GridSelection | null
  readonly activeCell: CellAddress | null
  readonly selectedRange: CellRange | null
}

