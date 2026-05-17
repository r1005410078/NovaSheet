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
  MutableDataSource,
  Row,
  Schema,
} from '@novasheet/core'

export type CellGenerator = (rowIndex: number, fieldId: string) => CellValue

export class GeneratedDataSource implements DataSource, MutableDataSource {
  private overrides = new Map<string, CellValue>()
  private listeners = new Set<DataSourceListener>()

  constructor(
    private rowCount: number,
    private schema: Schema,
    private cellFn: CellGenerator,
  ) {}

  getRowCount(): number {
    return this.rowCount
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
    const end = Math.min(this.rowCount - 1, endIndex)
    if (end < start) return []
    const out: Row[] = new Array(end - start + 1)
    for (let r = start; r <= end; r++) {
      const row: Row = {}
      for (const f of this.schema.fields) {
        const key = `${r}:${f.id}`
        row[f.id] = this.overrides.has(key) ? this.overrides.get(key)! : this.cellFn(r, f.id)
      }
      out[r - start] = row
    }
    return out
  }

  /** Paint hot path——必须同步、零分配。Renderer 每帧调 ~600 次。 */
  getCell(rowIndex: number, fieldId: string): CellValue | undefined {
    if (rowIndex < 0 || rowIndex >= this.rowCount) return undefined
    const key = `${rowIndex}:${fieldId}`
    if (this.overrides.has(key)) return this.overrides.get(key)
    return this.cellFn(rowIndex, fieldId)
  }

  updateCell(rowIndex: number, fieldId: string, value: CellValue): void {
    if (rowIndex < 0 || rowIndex >= this.rowCount) return
    this.overrides.set(`${rowIndex}:${fieldId}`, value)
    this.emit({ type: 'rowsChanged', startIndex: rowIndex, endIndex: rowIndex })
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
