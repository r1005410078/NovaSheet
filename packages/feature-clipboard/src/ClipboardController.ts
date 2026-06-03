import {
  computePasteTarget,
  isMutableDataSource,
  parseTsvToCells,
  serializeRowsToTsv,
  type ApplyPasteSource,
  type CellRange,
  type Row,
} from '@novasheet/core'
import type { WebClipboard, WebClipboardRuntimeDeps } from '@novasheet/web'
import { WebClipboardAdapter } from './WebClipboardAdapter'

export type ClipboardControllerDeps = WebClipboardRuntimeDeps

interface ClipboardCache {
  range: CellRange
  rows: readonly Row[]
  tsvHash: number
}

/** FNV-1a：typed-paste 缓存命中判定（剪贴板 TSV 与缓存一致才走高保真粘贴）。 */
function fnv1aHash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

/**
 * 剪贴板控制器（纯命令，无 DOM）。自持 navigator 包装与 typed-paste 缓存。
 *
 * copy 序列化选区 + 缓存；cut 复制后清源；paste 命中缓存走高保真、否则解析外部 TSV。
 */
export class ClipboardController implements WebClipboard {
  private readonly adapter = new WebClipboardAdapter()
  private cache: ClipboardCache | null = null

  constructor(private readonly deps: ClipboardControllerDeps) {}

  onDataReplaced(): void {
    this.cache = null
  }

  async copy(): Promise<boolean> {
    const snap = this.snapshotSelection()
    if (!snap) return false
    this.cache = { range: snap.range, rows: snap.rows, tsvHash: fnv1aHash(snap.tsv) }
    await this.adapter.writeText(snap.tsv)
    this.deps.onCopy(snap.range)
    return true
  }

  async cut(): Promise<boolean> {
    if (!isMutableDataSource(this.deps.engine.getData())) return false
    const snap = this.snapshotSelection()
    if (!snap) return false
    this.cache = { range: snap.range, rows: snap.rows, tsvHash: fnv1aHash(snap.tsv) }
    await this.adapter.writeText(snap.tsv)
    this.deps.engine.clearRange(snap.range)
    this.deps.afterEngineMutation()
    this.deps.onCut(snap.range)
    return true
  }

  async paste(): Promise<boolean> {
    const data = this.deps.engine.getData()
    if (!isMutableDataSource(data)) return false
    const sel = this.deps.engine.getSelection()
    const active = sel.activeCell
    const range = sel.selectedRange
    if (!active || !range) return false

    const tsv = (await this.adapter.readText()) ?? ''
    if (tsv === '') return false

    const schema = data.getSchema()
    const fields = schema.fields
    const fieldIdsAtCols = fields.map((f) => f.id)
    const tsvHash = fnv1aHash(tsv)
    let source: ApplyPasteSource

    if (this.cache && this.cache.tsvHash === tsvHash) {
      const cachedRange = this.cache.range
      const cachedFieldIds = fields
        .slice(cachedRange.startCol, cachedRange.endCol + 1)
        .map((f) => f.id)
      const cells = this.cache.rows.map((row) => cachedFieldIds.map((fid) => row[fid] ?? null))
      source = { cells, sourceFieldIds: cachedFieldIds, typed: true }
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

    this.deps.engine.commitPaste(source, target, fieldIdsAtCols, (skipped) =>
      this.deps.onPasteSkipped(skipped),
    )
    this.deps.afterEngineMutation()
    this.deps.onPaste({
      startRow: target.startRow,
      endRow: target.endRow,
      startCol: target.startCol,
      endCol: target.endCol,
    })
    return true
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
    return { range, rows, tsv: serializeRowsToTsv(rows, fieldIds) }
  }
}
