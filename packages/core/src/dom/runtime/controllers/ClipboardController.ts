/**
 * ClipboardController——copy/cut/paste 与 undo/redo（GridRuntime 拆分 Task 4，见
 * `docs/superpowers/specs/2026-07-11-grid-runtime-decomposition-design.md` §3.2）。
 *
 * undo/redo 与剪贴板同属"用户级操作 + 事件"域：两者都是对同一份 selection-snapshot /
 * typed-cache 机制的操作，成功后统一走 `afterEngineMutation()` 收尾再触发通知回调，故归入
 * 同一 controller。
 */

import type { GridEngine } from '../../../engine/GridEngine'
import type { Row } from '../../../kernel/data/Schema'
import type { CellRange } from '../../../kernel/coords/SelectionTypes'
import type { PasteSkippedCell } from '../../../features/clipboard/types'
import type { DomClipboardAdapter } from '../../clipboard/DomClipboardAdapter'
import type { UndoEvent, RedoEvent } from '../GridRuntime'
import { isMutableDataSource } from '../../../kernel/data/MutableDataSource'
import { computePasteTarget } from '../../../features/clipboard/ApplyPaste'
import type { ApplyPasteSource } from '../../../features/clipboard/ApplyPaste'
import { parseTsvToCells, serializeRowsToTsv } from '../../../features/clipboard/TsvFormat'

/** Phase 4.1 — TSV FNV-1a 32-bit hash；用于验证 paste 时剪贴板内容是否仍是 grid 自己刚写出去的，决定 typed 缓存命中。 */
function fnv1aHash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

/** typed paste 缓存的形状；copy/cut 写入，paste 命中同一 tsvHash 时读取还原值类型 + attachment。 */
type ClipboardCache = {
  range: CellRange
  rows: readonly Row[]
  tsvHash: number
  attachments?: ReadonlyArray<ReadonlyArray<Record<string, string>>>
} | null

/** ClipboardController 的窄依赖接口——只列它真正需要的 GridRuntime 能力。 */
export interface ClipboardControllerDeps {
  readonly engine: GridEngine
  isDestroyed(): boolean
  afterEngineMutation(): void
}

export class ClipboardController {
  private readonly deps: ClipboardControllerDeps
  /** Phase 4.1 — 剪贴板读写 adapter。 */
  private clipboardAdapter?: DomClipboardAdapter
  /** 最近一次从 grid 写出的剪贴板缓存，用于 typed paste 保留值类型。 */
  private clipboardCache: ClipboardCache = null
  /** copy 成功后的通知回调。 */
  private onCopy?: (range: CellRange) => void
  /** cut 成功后的通知回调。 */
  private onCut?: (range: CellRange) => void
  /** paste 成功后的通知回调。 */
  private onPaste?: (target: CellRange) => void
  /** paste 跳过只读/非法单元格后的通知回调。 */
  private onPasteSkipped?: (cells: readonly PasteSkippedCell[]) => void
  /** Phase 4.2 — undo 成功后的通知回调。 */
  private onUndo?: (event: UndoEvent) => void
  /** Phase 4.2 — redo 成功后的通知回调。 */
  private onRedo?: (event: RedoEvent) => void

  constructor(deps: ClipboardControllerDeps) {
    this.deps = deps
  }

  /** Phase 4.1 — 注入 clipboard adapter；未注入时 copy/cut/paste 全 silent no-op。 */
  setAdapter(adapter: DomClipboardAdapter): void {
    this.clipboardAdapter = adapter
  }

  /** 注册 copy 成功通知回调。 */
  setOnCopy(cb: (range: CellRange) => void): void {
    this.onCopy = cb
  }

  /** 注册 cut 成功通知回调。 */
  setOnCut(cb: (range: CellRange) => void): void {
    this.onCut = cb
  }

  /** 注册 paste 成功通知回调。 */
  setOnPaste(cb: (target: CellRange) => void): void {
    this.onPaste = cb
  }

  /** 注册 paste 跳过单元格通知回调。 */
  setOnPasteSkipped(cb: (cells: readonly PasteSkippedCell[]) => void): void {
    this.onPasteSkipped = cb
  }

  /** 注册 undo 成功通知回调。 */
  setOnUndo(cb: (event: UndoEvent) => void): void {
    this.onUndo = cb
  }

  /** 注册 redo 成功通知回调。 */
  setOnRedo(cb: (event: RedoEvent) => void): void {
    this.onRedo = cb
  }

  /** 返回当前 undo 栈是否可撤销。 */
  canUndo(): boolean {
    return this.deps.engine.canUndo()
  }

  /** 返回当前 redo 栈是否可重做。 */
  canRedo(): boolean {
    return this.deps.engine.canRedo()
  }

  /** 执行一次 undo，并在成功后刷新视图与通知 consumer。 */
  undo(): void {
    if (this.deps.isDestroyed()) return
    const cmd = this.deps.engine.undo()
    if (!cmd) return
    this.deps.afterEngineMutation()
    this.onUndo?.({ command: cmd })
  }

  /** 执行一次 redo，并在成功后刷新视图与通知 consumer。 */
  redo(): void {
    if (this.deps.isDestroyed()) return
    const cmd = this.deps.engine.redo()
    if (!cmd) return
    this.deps.afterEngineMutation()
    this.onRedo?.({ command: cmd })
  }

  /** snapshot 当前 selectedRange 的值 + TSV；selection 空返回 null。 */
  private snapshotSelection(): { range: CellRange; rows: Row[]; tsv: string } | null {
    const sel = this.deps.engine.getSelection()
    const range = sel.selectedRange
    if (!range) return null
    const data = this.deps.engine.getData()
    const fields = data.getSchema().fields
    const fieldIds = fields.slice(range.startCol, range.endCol + 1).map((f) => f.id)
    const rows: Row[] = []
    for (let r = range.startRow; r <= range.endRow; r++) {
      const row: Row = {}
      for (const fid of fieldIds) row[fid] = data.getCell(r, fid) ?? null
      rows.push(row)
    }
    return { range, rows, tsv: serializeRowsToTsv(rows, fieldIds, data.getSchema()) }
  }

  /**
   * 遍历选区每格、每注册 namespace，经 codec.serialize 存入二维数组（行×列）。
   * 坐标：range 是 view 坐标，读 attachment 前经 viewRowToRaw/viewColToRaw 转换。
   */
  private captureSelectionAttachments(range: CellRange): Record<string, string>[][] {
    const namespaces = this.deps.engine.getAttachmentNamespaces()
    const grid: Record<string, string>[][] = []
    for (let r = range.startRow; r <= range.endRow; r++) {
      const rowOut: Record<string, string>[] = []
      for (let c = range.startCol; c <= range.endCol; c++) {
        const cell: Record<string, string> = {}
        if (namespaces.length > 0) {
          const rawRow = this.deps.engine.viewRowToRaw(r)
          const rawCol = this.deps.engine.viewColToRaw(c)
          for (const ns of namespaces) {
            const data = this.deps.engine.getCellAttachment(ns, rawRow, rawCol)
            if (data !== undefined) {
              const codec = this.deps.engine.getAttachmentCodec(ns)
              if (codec) cell[ns] = codec.serialize(data)
            }
          }
        }
        rowOut.push(cell)
      }
      grid.push(rowOut)
    }
    return grid
  }

  /** 处理 copy：序列化当前选区、写入剪贴板并更新 typed paste 缓存。 */
  async handleClipboardCopy(): Promise<boolean> {
    if (this.deps.isDestroyed()) return false
    const snap = this.snapshotSelection()
    if (!snap) return false
    this.clipboardCache = {
      range: snap.range,
      rows: snap.rows,
      tsvHash: fnv1aHash(snap.tsv),
      attachments: this.captureSelectionAttachments(snap.range),
    }
    await this.clipboardAdapter?.writeText(snap.tsv)
    this.onCopy?.(snap.range)
    return true
  }

  /** 处理 cut：复制当前选区后清空源区域。 */
  async handleClipboardCut(): Promise<boolean> {
    if (this.deps.isDestroyed()) return false
    if (!isMutableDataSource(this.deps.engine.getData())) return false
    const snap = this.snapshotSelection()
    if (!snap) return false
    this.clipboardCache = {
      range: snap.range,
      rows: snap.rows,
      tsvHash: fnv1aHash(snap.tsv),
      attachments: this.captureSelectionAttachments(snap.range),
    }
    await this.clipboardAdapter?.writeText(snap.tsv)
    this.deps.engine.clearRange(snap.range)
    this.deps.afterEngineMutation()
    this.onCut?.(snap.range)
    return true
  }

  /** 处理 paste：读取剪贴板、推导目标区域并提交到 engine。 */
  async handleClipboardPaste(): Promise<boolean> {
    if (this.deps.isDestroyed()) return false
    const data = this.deps.engine.getData()
    if (!isMutableDataSource(data)) return false
    const sel = this.deps.engine.getSelection()
    const active = sel.activeCell
    const range = sel.selectedRange
    if (!active || !range) return false

    const tsv = (await this.clipboardAdapter?.readText()) ?? ''
    if (tsv === '') return false

    const schema = data.getSchema()
    const fields = schema.fields
    const fieldIdsAtCols = fields.map((f) => f.id)
    const tsvHash = fnv1aHash(tsv)
    let source: ApplyPasteSource

    let attachmentWrites: import('../../../features/clipboard/PasteController').AttachmentWrite[] | undefined
    if (this.clipboardCache && this.clipboardCache.tsvHash === tsvHash) {
      const cachedRange = this.clipboardCache.range
      const cachedFieldIds = fields
        .slice(cachedRange.startCol, cachedRange.endCol + 1)
        .map((f) => f.id)
      const cells = this.clipboardCache.rows.map((row) =>
        cachedFieldIds.map((fid) => row[fid] ?? null),
      )
      source = { cells, sourceFieldIds: cachedFieldIds, typed: true }
      // typed-cache 命中时恢复 attachment（codec deserialize + view→raw）
      attachmentWrites = []
    } else {
      const anchorFieldIds = fieldIdsAtCols.slice(active.colIndex)
      const cells = parseTsvToCells(tsv, anchorFieldIds, schema)
      source = { cells, sourceFieldIds: anchorFieldIds, typed: false }
    }

    const sourceRows = source.cells.length
    const sourceCols = source.cells[0]?.length ?? 0
    if (sourceRows === 0 || sourceCols === 0) return false

    const target = computePasteTarget(active, range, sourceRows, sourceCols, {
      rowCount: data.getRowCount(),
      colCount: fields.length,
    })

    // typed-cache 命中时构建 attachmentWrites（target 偏移对齐 cache 左上角）
    if (attachmentWrites !== undefined && this.clipboardCache?.attachments) {
      const cachedAttachments = this.clipboardCache.attachments
      for (let r = target.startRow; r <= target.endRow; r++) {
        for (let c = target.startCol; c <= target.endCol; c++) {
          const cacheRow = (r - target.startRow) % sourceRows
          const cacheCol = (c - target.startCol) % sourceCols
          const cellAttachments = cachedAttachments[cacheRow]?.[cacheCol]
          if (!cellAttachments) continue
          for (const [ns, serialized] of Object.entries(cellAttachments)) {
            const codec = this.deps.engine.getAttachmentCodec(ns)
            if (!codec) continue
            const data = codec.deserialize(serialized)
            const rawRow = this.deps.engine.viewRowToRaw(r)
            const rawCol = this.deps.engine.viewColToRaw(c)
            attachmentWrites.push({ rawRow, rawCol, namespace: ns, data })
          }
        }
      }
    }

    this.deps.engine.commitPaste(source, target, fieldIdsAtCols, (skipped) =>
      this.onPasteSkipped?.(skipped),
    attachmentWrites?.length ? attachmentWrites : undefined,
    )
    this.deps.afterEngineMutation()
    const targetRange: CellRange = {
      startRow: target.startRow,
      endRow: target.endRow,
      startCol: target.startCol,
      endCol: target.endCol,
    }
    this.onPaste?.(targetRange)
    return true
  }

  /** setData/updateViewData 后清空 typed paste 缓存。 */
  clearCache(): void {
    this.clipboardCache = null
  }

  /**
   * @internal 仅供白盒测试（`clipboard-attachment-copy.test.ts` 经
   * `(runtime as unknown as { clipboard: ... }).clipboard.peekCacheForLegacyTest()` 读取）；
   * 生产代码路径不应依赖此方法。测试迁移到走 public API 后（spec §3.2 Task 11）应删除本方法。
   */
  peekCacheForLegacyTest(): ClipboardCache {
    return this.clipboardCache
  }
}
