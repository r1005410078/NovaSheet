/**
 * GeneratedDataSource——按需计算行的 DataSource 实现，演示 / 压测专用。
 *
 * 与 InMemoryDataSource 的区别：不预分配行数组。1M 行的构造从 3-8 秒（V8 分配
 * 3000 万个 JS 值）降到 0ms（只 new 一个类实例）。Renderer 每帧只为可见 cell 调
 * `getCell` —— 单次调用 < 1μs，1M 行不再是 data-layer 瓶颈。
 *
 * 编辑覆盖：实现 `MutableDataSource`，`updateCell` 写入稀疏 `Map`，`getCell`
 * 优先读 override，再退回生成函数。编辑过的格保留生成行为同时支持改写——
 * 让大数据 demo 也能演示双击编辑。
 *
 * 适用场景：可程序化生成的展示 / mock 数据。真实业务数据请用 InMemoryDataSource
 * （≤ 30万行）或 Phase 4 的分页 DataSource。
 *
 * 不在 @novasheet/core 里——这是 demo 工具，不属于公共 API。
 */

import type {
  CellValue,
  DataSource,
  DataSourceEvent,
  DataSourceListener,
  Field,
  MutableDataSource,
  RemovedFieldSnapshot,
  Row,
  Schema,
} from '@novasheet/core'

export type CellGenerator = (rowIndex: number, fieldId: string) => CellValue

/** deleteRows 返回的快照（结构等同 core 的 DeletedRowSnapshot，未导出故内联）。 */
interface DeletedRowSnapshot {
  readonly originalUnderlyingRow: number
  readonly cells: Readonly<Record<string, CellValue>>
}

export class GeneratedDataSource implements DataSource, MutableDataSource {
  /** override / 删除快照按**稳定行 key** 锚定，不随结构变动而错位；key 为 `${rowKey}:${fieldId}`。 */
  private overrides = new Map<string, CellValue>()
  private listeners = new Set<DataSourceListener>()
  /** 构造时的生成行数；生成行 key ∈ [0, initialRowCount)，cellFn 仅对这些 key 生成。 */
  private readonly initialRowCount: number
  /**
   * 视图顺序下每行的稳定 key；`null` 表示尚未发生行结构变动（恒等映射 key==index）。
   * 惰性物化：保留 GeneratedDataSource「0ms 挂载、不预分配 1M 数组」的初衷，
   * 仅当首次 insert/delete/move 行时才分配。
   */
  private rowOrder: number[] | null = null
  /** 插入空白行的稳定 key 计数器（从 initialRowCount 起，永不与生成 key 冲突）。 */
  private nextRowKey: number

  constructor(
    rowCount: number,
    private schema: Schema,
    private cellFn: CellGenerator,
  ) {
    this.initialRowCount = rowCount
    this.nextRowKey = rowCount
  }

  /** 当前行数：物化后取 rowOrder 长度，否则为初始生成行数。 */
  private get count(): number {
    return this.rowOrder ? this.rowOrder.length : this.initialRowCount
  }

  /** 视图行下标 → 稳定行 key。 */
  private keyAt(rowIndex: number): number {
    return this.rowOrder ? this.rowOrder[rowIndex]! : rowIndex
  }

  /** 首次行结构变动前物化 rowOrder 为恒等序列 [0, initialRowCount)。 */
  private materializeRowOrder(): void {
    if (!this.rowOrder) {
      this.rowOrder = Array.from({ length: this.initialRowCount }, (_, i) => i)
    }
  }

  getRowCount(): number {
    return this.count
  }

  getSchema(): Schema {
    return this.schema
  }

  /**
   * Renderer 每帧调一次（区间预热）；按 endIndex inclusive 的约定（与
   * ChunkedAxis.getVisibleRange 一致——CLAUDE.md 不变量 #4）。
   * 同步返回——无 IO，无缓存，纯计算。
   */
  getRows(startIndex: number, endIndex: number): Row[] {
    const start = Math.max(0, startIndex)
    const end = Math.min(this.count - 1, endIndex)
    if (end < start) return []
    const out: Row[] = new Array(end - start + 1)
    for (let r = start; r <= end; r++) {
      const row: Row = {}
      for (const f of this.schema.fields) row[f.id] = this.getCell(r, f.id) ?? null
      out[r - start] = row
    }
    return out
  }

  /** Paint hot path——必须同步、零分配。Renderer 每帧调 ~600 次。 */
  getCell(rowIndex: number, fieldId: string): CellValue | undefined {
    if (rowIndex < 0 || rowIndex >= this.count) return undefined
    const key = this.keyAt(rowIndex)
    const override = this.overrides.get(`${key}:${fieldId}`)
    if (override !== undefined) return override
    // 生成行才回退 cellFn；插入的空白行（key >= initialRowCount）无生成内容。
    return key < this.initialRowCount ? this.cellFn(key, fieldId) : undefined
  }

  updateCell(rowIndex: number, fieldId: string, value: CellValue): void {
    if (rowIndex < 0 || rowIndex >= this.count) return
    this.overrides.set(`${this.keyAt(rowIndex)}:${fieldId}`, value)
    this.emit({ type: 'rowsChanged', startIndex: rowIndex, endIndex: rowIndex })
  }

  /** GeneratedDataSource 无 view↔raw 间接层，underlying row 即行下标。 */
  updateCellByUnderlyingRow(underlyingRow: number, fieldId: string, value: CellValue): void {
    this.updateCell(underlyingRow, fieldId, value)
  }

  insertRows(beforeUnderlyingRow: number, count: number): readonly number[] {
    if (count <= 0) return []
    this.materializeRowOrder()
    const order = this.rowOrder!
    const at = Math.max(0, Math.min(beforeUnderlyingRow, order.length))
    const newKeys = Array.from({ length: count }, () => this.nextRowKey++)
    order.splice(at, 0, ...newKeys)
    const newIds = Array.from({ length: count }, (_, i) => at + i)
    this.emit({ type: 'rowsInserted', at, count })
    this.emit({ type: 'rowCountChanged', newCount: order.length })
    return newIds
  }

  deleteRows(underlyingRowIds: readonly number[]): readonly DeletedRowSnapshot[] {
    this.materializeRowOrder()
    const order = this.rowOrder!
    const ids = [...underlyingRowIds].sort((a, b) => a - b)
    const snapshots: DeletedRowSnapshot[] = []
    for (const id of ids) {
      if (id < 0 || id >= order.length) continue
      const cells: Record<string, CellValue> = {}
      for (const f of this.schema.fields) {
        const v = this.getCell(id, f.id)
        if (v !== undefined) cells[f.id] = v
      }
      snapshots.push({ originalUnderlyingRow: id, cells })
    }
    for (let i = ids.length - 1; i >= 0; i -= 1) order.splice(ids[i]!, 1)
    this.emit({ type: 'rowsDeleted', removed: ids })
    this.emit({ type: 'rowCountChanged', newCount: order.length })
    return snapshots
  }

  moveRows(underlyingRowIds: readonly number[], beforeRowId: number | null): void {
    if (underlyingRowIds.length === 0) return
    this.materializeRowOrder()
    const order = this.rowOrder!
    const sorted = [...underlyingRowIds].sort((a, b) => a - b)
    const start = sorted[0]!
    const end = sorted[sorted.length - 1]!
    const insertAt =
      beforeRowId === null
        ? order.length - sorted.length
        : beforeRowId > end
          ? beforeRowId - sorted.length
          : beforeRowId
    const moving = order.slice(start, end + 1)
    const remaining = order.filter((_, index) => index < start || index > end)
    remaining.splice(insertAt, 0, ...moving)
    this.rowOrder = remaining
    this.emit({ type: 'rowsMoved', rowIds: sorted, beforeRowId })
  }

  insertField(beforeIndex: number, field: Field): Field {
    const fields = [...this.schema.fields]
    const at = Math.max(0, Math.min(beforeIndex, fields.length))
    fields.splice(at, 0, field)
    this.schema = { ...this.schema, fields }
    this.emit({ type: 'colsInserted', at, field })
    return field
  }

  removeField(fieldId: string): RemovedFieldSnapshot | null {
    const idx = this.schema.fields.findIndex((field) => field.id === fieldId)
    if (idx < 0) return null
    const field = this.schema.fields[idx]!
    // 稀疏 cells：只装 override（生成值在 undo 时由 cellFn 重新生成，无需物化 1M 列）。
    const cells: (CellValue | undefined)[] = new Array(this.count)
    for (const [overrideKey, value] of this.overrides) {
      const sep = overrideKey.indexOf(':')
      if (overrideKey.slice(sep + 1) !== fieldId) continue
      const rowKey = Number(overrideKey.slice(0, sep))
      const index = this.rowOrder ? this.rowOrder.indexOf(rowKey) : rowKey
      if (index >= 0) cells[index] = value
      this.overrides.delete(overrideKey)
    }
    const fields = [...this.schema.fields]
    fields.splice(idx, 1)
    this.schema = { ...this.schema, fields }
    this.emit({ type: 'colsDeleted', removed: [{ index: idx, fieldId }] })
    return { originalIndex: idx, field, cells }
  }

  moveFields(fieldIds: readonly string[], beforeFieldId: string | null): void {
    const movingIds = new Set(fieldIds)
    const moving = this.schema.fields.filter((field) => movingIds.has(field.id))
    if (moving.length === 0) return
    if (beforeFieldId !== null && movingIds.has(beforeFieldId)) return
    const remaining = this.schema.fields.filter((field) => !movingIds.has(field.id))
    const at =
      beforeFieldId === null
        ? remaining.length
        : remaining.findIndex((field) => field.id === beforeFieldId)
    if (at < 0) return
    const nextFields = remaining.slice()
    nextFields.splice(at, 0, ...moving)
    this.schema = { ...this.schema, fields: nextFields }
    this.emit({ type: 'colsMoved', fieldIds: moving.map((field) => field.id), beforeFieldId })
  }

  subscribe(listener: DataSourceListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(event: DataSourceEvent): void {
    for (const l of this.listeners) l(event)
  }
}
