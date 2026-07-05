import type { RangeSlice } from '../../../ports/WindowedDataProvider'
import type { BlockCache } from './BlockCache'
import type { BlockCoord } from './blockGeometry'
import { blockKey, blockToWindow } from './blockGeometry'
import type { CellValue, Schema } from '../Schema'
import type { DataWindow } from '../DataSource'

/**
 * 把一个合并矩形请求的响应切片拆回各构成块并写入缓存。
 * rect 的行范围恒等于单个 blockRow 的行范围（mergeBlocksIntoRects 只做水平合并），
 * 因此只需要按列切分；长度不符时按 §7 容错：多余截断、缺失位置保持 miss（undefined）。
 */
export function applySliceToBlocks(
  cache: BlockCache,
  rect: DataWindow,
  blocks: readonly BlockCoord[],
  slice: RangeSlice,
  schema: Schema,
  blockRowsSize: number,
  blockColsSize: number,
  rowCount: number,
  colCount: number,
  nowMs: number,
): void {
  const expectedRowSpan = rect.endRow - rect.startRow + 1
  if (slice.rows.length !== expectedRowSpan) {
    console.warn(
      `[WindowedDataSource] loadRange returned ${slice.rows.length} rows, expected ${expectedRowSpan} for window`,
      rect,
    )
  }

  for (const coord of blocks) {
    const blockWindow = blockToWindow(coord, blockRowsSize, blockColsSize, rowCount, colCount)
    const rowSpan = blockWindow.endRow - blockWindow.startRow + 1
    const colSpan = blockWindow.endCol - blockWindow.startCol + 1
    const values: (CellValue | undefined)[] = Array.from({ length: rowSpan * colSpan })

    for (let r = 0; r < rowSpan; r += 1) {
      const sliceIndex = blockWindow.startRow - rect.startRow + r
      const row = slice.rows[sliceIndex]
      for (let c = 0; c < colSpan; c += 1) {
        const field = schema.fields[blockWindow.startCol + c]
        values[r * colSpan + c] = field && row ? row[field.id] : undefined
      }
    }

    cache.set(blockKey(coord.blockRow, coord.blockCol), { rowSpan, colSpan, values, nowMs })
  }
}
