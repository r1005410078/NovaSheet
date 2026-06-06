import type { MutableDataSource } from '../kernel/data/MutableDataSource'
import type { CellAddress, CellRange } from '../engine/selection/SelectionTypes'
import type { CellValue, Schema } from '../kernel/data/Schema'
import type { MergeRegion } from '../merge/MergeStore'
import type { PasteSkippedCell } from './types'

export interface PasteWriteRecord {
  readonly rowIndex: number
  readonly fieldId: string
  readonly before: CellValue
  readonly after: CellValue
}

export interface PasteTargetRect {
  readonly startRow: number
  readonly endRow: number
  readonly startCol: number
  readonly endCol: number
  readonly tile: { rows: number; cols: number }
}

export interface ApplyPasteSource {
  readonly cells: readonly (readonly (string | number | boolean | null | CellValue)[])[]
  readonly sourceFieldIds: readonly string[]
  readonly typed: boolean
}

export interface GridDimensions {
  readonly rowCount: number
  readonly colCount: number
}

export function computePasteTarget(
  active: CellAddress,
  selection: CellRange,
  sourceRows: number,
  sourceCols: number,
  dims: GridDimensions,
): PasteTargetRect {
  const selRows = selection.endRow - selection.startRow + 1
  const selCols = selection.endCol - selection.startCol + 1

  let startRow = selection.startRow
  let startCol = selection.startCol
  let endRow: number
  let endCol: number
  let tileRows = 1
  let tileCols = 1

  if (selRows === 1 && selCols === 1) {
    // single cell — expand from active to source size
    startRow = active.rowIndex
    startCol = active.colIndex
    endRow = startRow + sourceRows - 1
    endCol = startCol + sourceCols - 1
  } else if (selRows === sourceRows && selCols === sourceCols) {
    endRow = selection.endRow
    endCol = selection.endCol
  } else if (selRows % sourceRows === 0 && selCols % sourceCols === 0) {
    tileRows = selRows / sourceRows
    tileCols = selCols / sourceCols
    endRow = selection.endRow
    endCol = selection.endCol
  } else {
    // mismatch（非倍数 / 超出）：从 selection 左上角向右下扩 source 大小；
    // 不与 selection 边界 clip（不足时 selection 内剩余 cell 不动），仅与 grid dims clip
    endRow = selection.startRow + sourceRows - 1
    endCol = selection.startCol + sourceCols - 1
  }

  endRow = Math.min(endRow, dims.rowCount - 1)
  endCol = Math.min(endCol, dims.colCount - 1)
  return { startRow, endRow, startCol, endCol, tile: { rows: tileRows, cols: tileCols } }
}

/**
 * Phase 5-A — 判断粘贴目标矩形是否与任一合并区域相交。
 *
 * 纯矩形相交测试，**坐标空间无关**：调用方须把 `target` 与 `merges` 传入**同一空间**
 * （引擎侧先把 view target 翻译为 raw 再与 raw 合并区域比较）。任意重叠即冲突——
 * 1×1 粘贴落入 2×2 合并区域内部也算冲突，因为它会破坏合并结构。
 */
export function pasteTargetConflictsWithMerges(
  target: PasteTargetRect,
  merges: readonly MergeRegion[],
): boolean {
  return merges.some(
    (region) =>
      target.startRow <= region.range.endRow &&
      target.endRow >= region.range.startRow &&
      target.startCol <= region.range.endCol &&
      target.endCol >= region.range.startCol,
  )
}

const SKIP = Symbol('skip')

function coerceForType(
  raw: string | number | boolean | null | CellValue,
  type: string | undefined,
): CellValue | typeof SKIP {
  if (raw === null || raw === undefined) return null
  if (type === 'number') {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : SKIP
    if (typeof raw === 'string') {
      if (raw.trim() === '') return null
      const n = Number(raw.trim())
      return Number.isFinite(n) ? n : SKIP
    }
    return SKIP
  }
  if (type === 'checkbox') {
    if (typeof raw === 'boolean') return raw
    return SKIP
  }
  // text / unknown → string-ify
  if (typeof raw === 'string') return raw
  return String(raw)
}

export function applyPaste(
  source: ApplyPasteSource,
  target: PasteTargetRect,
  schema: Schema,
  fieldIdsAtCols: readonly string[],
  data: MutableDataSource,
  onSkipped?: (cells: readonly PasteSkippedCell[]) => void,
  onWrite?: (record: PasteWriteRecord) => void,
): void {
  const skipped: PasteSkippedCell[] = []
  const sourceRows = source.cells.length
  const sourceCols = source.cells[0]?.length ?? 0
  if (sourceRows === 0 || sourceCols === 0) return

  const fieldTypeById = new Map(schema.fields.map((f) => [f.id, f.type as string]))

  for (let r = target.startRow; r <= target.endRow; r++) {
    for (let c = target.startCol; c <= target.endCol; c++) {
      const localR = (r - target.startRow) % sourceRows
      const localC = (c - target.startCol) % sourceCols
      const rawValue = source.cells[localR]![localC]!
      const fieldId = fieldIdsAtCols[c]
      if (!fieldId) continue

      if (source.typed) {
        if (onWrite) {
          const beforeTyped = data.getCell(r, fieldId) ?? null
          onWrite({ rowIndex: r, fieldId, before: beforeTyped, after: rawValue as CellValue })
        }
        data.updateCell(r, fieldId, rawValue as CellValue)
        continue
      }

      const type = fieldTypeById.get(fieldId)
      const coerced = coerceForType(rawValue, type)
      if (coerced === SKIP) {
        skipped.push({ rowIndex: r, fieldId, reason: 'type' })
        continue
      }
      if (onWrite) {
        const beforeCoerced = data.getCell(r, fieldId) ?? null
        onWrite({ rowIndex: r, fieldId, before: beforeCoerced, after: coerced as CellValue })
      }
      data.updateCell(r, fieldId, coerced as CellValue)
    }
  }

  if (skipped.length > 0) onSkipped?.(skipped)
}
