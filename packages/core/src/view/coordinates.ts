import type { DataSource } from '../kernel/data/DataSource'
import type { CellRange } from '../features/selection/SelectionTypes'

/**
 * **raw 空间**的 `CellRange`（底层 row/col 索引，stores 按此键控）。
 *
 * phantom brand：运行时即普通 `CellRange`、零开销；编译期把 raw 与 view 两个语义空间分开，
 * 挡住「把 view 选区直接喂给按 raw 键控的 store」这类混用（R2 头号 bug 源）。
 * 唯一构造点：`CoordinateSpace.viewRangeToRaw`（view→raw 翻译）与 raw 空间内派生区
 * （fill 平铺等）经 `asRawRange` 显式断言。
 */
export type RawRange = CellRange & { readonly __space: 'raw' }

/** 把一个已知处于 raw 空间的 `CellRange` 标记为 `RawRange`（纯类型断言，无运行时行为）。 */
export const asRawRange = (range: CellRange): RawRange => range as RawRange

export function resolveUnderlyingRow(source: DataSource, viewRow: number): number {
  return source.resolveUnderlyingRow?.(viewRow) ?? viewRow
}

export function findViewRow(source: DataSource, underlyingRow: number): number {
  return source.findViewRow?.(underlyingRow) ?? underlyingRow
}
