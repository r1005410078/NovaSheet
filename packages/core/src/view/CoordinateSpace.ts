import type { CellRange } from '../engine/selection/SelectionTypes'
import type { DataSource } from '../data/DataSource'
import type { Schema } from '../data/Schema'
import { asRawRange, findViewRow, resolveUnderlyingRow, type RawRange } from './coordinates'

/**
 * CoordinateSpace 读取所需的引擎活状态（live，每次调用读最新）：
 * view 数据源（行 raw↔view）、raw schema 与隐藏列集合（列 raw↔view）。
 */
export interface CoordinateContext {
  /** 当前 view 数据源（经 hide/sort/filter 组合）。 */
  getViewData(): DataSource
  /** 原始（raw）schema，列顺序为底层顺序。 */
  getRawSchema(): Schema
  /** 该 fieldId 是否被隐藏（影响列 raw↔view 映射）。 */
  isColHidden(fieldId: string): boolean
}

/**
 * 行/列/区的 raw↔view 翻译唯一入口。
 *
 * 收口此前散在 `DefaultGridEngine` 私有方法里的翻译逻辑（行经 `resolveUnderlyingRow`、
 * 列经隐藏列折叠、区翻译 + 非连续保守 null）。引擎持有一个实例并委托。
 *
 * **非连续约定**：`viewRangeToRaw` 在排序/筛选打乱使 view 区映射到 raw 后不连续时返回
 * `null`（调用方据此保守 no-op）——该约定**只在此处一处**实现，避免散点重复。
 */
export class CoordinateSpace {
  constructor(private readonly ctx: CoordinateContext) {}

  /** view 行 → raw（underlying）行。无 hide/sort/filter 时恒等。 */
  viewRowToRaw(viewRow: number): number {
    return resolveUnderlyingRow(this.ctx.getViewData(), viewRow)
  }

  /** raw 行 → view 行；不可见时返回 -1。 */
  rawRowToView(rawRow: number): number {
    return findViewRow(this.ctx.getViewData(), rawRow)
  }

  /** fieldId → raw 列序（底层 schema 顺序）；未知 id 返回 -1。 */
  fieldIdToRaw(fieldId: string): number {
    return this.ctx.getRawSchema().fields.findIndex((field) => field.id === fieldId)
  }

  /** view 列 → raw 列；越界返回 -1。 */
  viewColToRaw(viewCol: number): number {
    const fields = this.ctx.getRawSchema().fields
    let visible = 0
    for (let raw = 0; raw < fields.length; raw += 1) {
      if (this.ctx.isColHidden(fields[raw]!.id)) continue
      if (visible === viewCol) return raw
      visible += 1
    }
    return -1
  }

  /** raw 列 → view 列；该列隐藏或越界返回 -1。`viewColToRaw` 的逆。 */
  rawColToView(rawCol: number): number {
    const fields = this.ctx.getRawSchema().fields
    if (rawCol < 0 || rawCol >= fields.length) return -1
    if (this.ctx.isColHidden(fields[rawCol]!.id)) return -1
    let visible = 0
    for (let raw = 0; raw < rawCol; raw += 1) {
      if (!this.ctx.isColHidden(fields[raw]!.id)) visible += 1
    }
    return visible
  }

  /**
   * view `CellRange` → raw `CellRange`；当 raw 映射不连续（排序/筛选打乱）时返回 `null`。
   * `range` 须已归一化（`startRow ≤ endRow`，`startCol ≤ endCol`）。
   */
  viewRangeToRaw(range: CellRange): RawRange | null {
    const rows = this.viewRowsContiguous(range.startRow, range.endRow)
    if (!rows) return null
    const cols = this.viewColsContiguous(range.startCol, range.endCol)
    if (!cols) return null
    return asRawRange({ startRow: rows.start, endRow: rows.end, startCol: cols.start, endCol: cols.end })
  }

  private viewRowsContiguous(startRow: number, endRow: number): { start: number; end: number } | null {
    const first = this.viewRowToRaw(startRow)
    let prev = first
    for (let viewRow = startRow + 1; viewRow <= endRow; viewRow += 1) {
      const raw = this.viewRowToRaw(viewRow)
      if (raw !== prev + 1) return null
      prev = raw
    }
    return { start: first, end: prev }
  }

  private viewColsContiguous(startCol: number, endCol: number): { start: number; end: number } | null {
    const first = this.viewColToRaw(startCol)
    if (first < 0) return null
    let prev = first
    for (let viewCol = startCol + 1; viewCol <= endCol; viewCol += 1) {
      const raw = this.viewColToRaw(viewCol)
      if (raw !== prev + 1) return null
      prev = raw
    }
    return { start: first, end: prev }
  }
}
