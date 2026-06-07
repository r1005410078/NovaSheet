import type { CellRange } from '../../kernel/coords/SelectionTypes'
import {
  DEFAULT_EXCEL_WORKSPACE_POLICY,
  type ExcelWorkspacePolicy,
} from './ExcelWorkspacePolicy'
import { decideExcelWorkspaceResize } from './ExcelWorkspaceRules'
import type {
  ExcelWorkspaceScrollIntent,
  ExcelWorkspaceSize,
  ExcelWorkspaceVisibleRange,
} from './ExcelWorkspaceTypes'

export interface ExcelWorkspacePort {
  getSize(): ExcelWorkspaceSize
  getVisibleRange(): ExcelWorkspaceVisibleRange
  getContentBounds(): CellRange | null
  hasMaterializedRows(start: number, end: number): boolean
  hasMaterializedCols(start: number, end: number): boolean
  appendRows(count: number): void
  appendCols(count: number): void
  resizeWorkspace(size: ExcelWorkspaceSize): void
}

export interface ExcelWorkspaceControllerOptions {
  readonly policy?: Partial<ExcelWorkspacePolicy>
  readonly port: ExcelWorkspacePort
}

export class ExcelWorkspaceController {
  private readonly policy: ExcelWorkspacePolicy
  private readonly port: ExcelWorkspacePort
  private lastIntent: ExcelWorkspaceScrollIntent | null = null
  private lastGrowAtMs: number | null = null

  constructor(options: ExcelWorkspaceControllerOptions) {
    this.policy = { ...DEFAULT_EXCEL_WORKSPACE_POLICY, ...options.policy }
    this.port = options.port
  }

  recordWheel(input: { readonly atMs: number; readonly deltaX: number; readonly deltaY: number }): void {
    this.lastIntent = { kind: 'wheel', ...input }
  }

  recordProgrammaticScroll(atMs: number): void {
    this.lastIntent = { kind: 'programmatic', atMs }
  }

  recordScrollbarScroll(atMs: number): void {
    if (
      this.lastIntent?.kind === 'wheel' &&
      atMs - this.lastIntent.atMs <= this.policy.wheelIntentTtlMs
    ) {
      return
    }
    this.lastIntent = { kind: 'scrollbar', atMs }
  }

  afterScrollFrame(nowMs: number): void {
    const size = this.port.getSize()
    const visible = this.port.getVisibleRange()
    const rowEdgeStart = Math.max(0, size.rowCount - this.policy.rowGrowThreshold)
    const colEdgeStart = Math.max(0, size.colCount - this.policy.colGrowThreshold)
    const decision = decideExcelWorkspaceResize({
      policy: this.policy,
      nowMs,
      size,
      visible,
      contentBounds: this.port.getContentBounds(),
      intent: this.lastIntent,
      hasMaterializedRows: this.port.hasMaterializedRows(rowEdgeStart, size.rowCount - 1),
      hasMaterializedCols: this.port.hasMaterializedCols(colEdgeStart, size.colCount - 1),
      lastGrowAtMs: this.lastGrowAtMs,
    })

    if (decision.kind === 'grow') {
      if (decision.rows > 0) this.port.appendRows(decision.rows)
      if (decision.cols > 0) this.port.appendCols(decision.cols)
      this.lastGrowAtMs = nowMs
      return
    }

    if (decision.kind === 'shrink') {
      this.port.resizeWorkspace({ rowCount: decision.rowCount, colCount: decision.colCount })
    }
  }
}
