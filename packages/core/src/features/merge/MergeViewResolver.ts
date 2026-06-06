import type { MergeRegion } from './MergeStore'

/** 合并区 view↔raw 翻译所需的最小坐标能力（`CoordinateSpace` 结构满足）。 */
export interface MergeViewCoords {
  viewRowToRaw(viewRow: number): number
  viewColToRaw(viewCol: number): number
  rawRowToView(rawRow: number): number
  rawColToView(rawCol: number): number
}

/** 合并区点查询源（`MergeStore` 结构满足）；坐标为 **raw**。 */
export interface MergeRegionSource {
  getRegionAt(rowIndex: number, colIndex: number): MergeRegion | null
}

/**
 * 单个合并区域 raw → view；隐藏行列或行序非连续返回 null（与 painter「不画半残合并」一致）。
 * 帧路径（`VisibleFormatResolver`）与交互式吸附（点击/导航/编辑）共用此唯一翻译，避免行为漂移。
 */
export function mergeRegionToView(
  region: MergeRegion,
  coords: MergeViewCoords,
): MergeRegion | null {
  const startRow = coords.rawRowToView(region.range.startRow)
  if (startRow === -1) return null
  let prevViewRow = startRow
  for (let raw = region.range.startRow + 1; raw <= region.range.endRow; raw += 1) {
    const viewRow = coords.rawRowToView(raw)
    if (viewRow === -1 || viewRow !== prevViewRow + 1) return null
    prevViewRow = viewRow
  }
  const endRow = prevViewRow
  const startCol = coords.rawColToView(region.range.startCol)
  const endCol = coords.rawColToView(region.range.endCol)
  if (startCol === -1 || endCol === -1) return null
  if (endCol - startCol !== region.range.endCol - region.range.startCol) return null
  return {
    id: region.id,
    range: { startRow, endRow, startCol, endCol },
    anchor: { rowIndex: startRow, colIndex: startCol },
  }
}

/**
 * 交互式合并吸附的唯一入口：view `(viewRow,viewCol)` → raw 查 `MergeStore` → 整块翻译回 view。
 * 单元格隐藏、合并区含隐藏行列、行序非连续或未命中合并区时返回 null。
 *
 * 取代「直接以 view 坐标查 raw 键控 store」的旧捷径——后者在 sort/filter/隐藏列（view≠raw）
 * 下会查错或漏查合并区。详见 spec 2026-06-05-novasheet-interactive-merge-snap-view-raw-coordinate。
 */
export function resolveViewMergeRegion(
  source: MergeRegionSource,
  coords: MergeViewCoords,
  viewRow: number,
  viewCol: number,
): MergeRegion | null {
  const rawRow = coords.viewRowToRaw(viewRow)
  const rawCol = coords.viewColToRaw(viewCol)
  if (rawRow < 0 || rawCol < 0) return null
  const region = source.getRegionAt(rawRow, rawCol)
  if (!region) return null
  return mergeRegionToView(region, coords)
}
