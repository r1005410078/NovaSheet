import type { CellRange } from './SelectionTypes'

/**
 * 一个合并单元格区域。`range` 为矩形覆盖范围，`anchor` 固定为左上角单元格
 * （承载文本与填充绘制）。坐标一律为 **raw** 空间（与 `RangeStyleStore` 一致）。
 */
export interface MergeRegion {
  readonly id: string
  readonly range: CellRange
  readonly anchor: { readonly rowIndex: number; readonly colIndex: number }
}
