import type { DataSource } from '../../../kernel/data/DataSource'
import type { CellRange } from '../../../kernel/coords/SelectionTypes'
import {
  ExcelWorkspaceController,
  type ExcelWorkspacePolicy,
  type ExcelWorkspacePort,
} from '../../../features/excel-workspace'
import type { GridEngine } from '../../../engine/GridEngine'
import type { NativeScrollSource } from '../../scroll/NativeScroller'

interface ExcelWorkspaceReadableDataSource extends DataSource {
  getContentBounds(): CellRange | null
  hasMaterializedRows(start: number, end: number): boolean
  hasMaterializedCols(start: number, end: number): boolean
}

function isExcelWorkspaceReadableDataSource(
  data: DataSource,
): data is ExcelWorkspaceReadableDataSource {
  const candidate = data as ExcelWorkspaceReadableDataSource
  return (
    typeof candidate.getContentBounds === 'function' &&
    typeof candidate.hasMaterializedRows === 'function' &&
    typeof candidate.hasMaterializedCols === 'function'
  )
}

export interface ExcelWorkspacePortDeps {
  readonly engine: GridEngine
  markMutated(): void
}

/** 独立导出便于单测;binding 内部复用 */
export function createExcelWorkspacePort(deps: ExcelWorkspacePortDeps): ExcelWorkspacePort {
  return {
    getSize: () => {
      const data = deps.engine.getData()
      return {
        rowCount: data.getRowCount(),
        colCount: data.getSchema().fields.length,
      }
    },
    getVisibleRange: () => {
      const main = deps.engine.getFrame().viewport.regions.find((region) => region.id === 'main')
      return {
        rows: main?.rowRange ?? [0, -1],
        cols: main?.colRange ?? [0, -1],
      }
    },
    getContentBounds: () => {
      const data = deps.engine.getData()
      return isExcelWorkspaceReadableDataSource(data) ? data.getContentBounds() : null
    },
    hasMaterializedRows: (start, end) => {
      const data = deps.engine.getData()
      return isExcelWorkspaceReadableDataSource(data) && data.hasMaterializedRows(start, end)
    },
    hasMaterializedCols: (start, end) => {
      const data = deps.engine.getData()
      return isExcelWorkspaceReadableDataSource(data) && data.hasMaterializedCols(start, end)
    },
    appendRows: (count) => {
      if (count <= 0) return
      const data = deps.engine.getData()
      const next = {
        rowCount: data.getRowCount() + count,
        colCount: data.getSchema().fields.length,
      }
      if (deps.engine.resizeExcelWorkspace(next)) deps.markMutated()
    },
    appendCols: (count) => {
      if (count <= 0) return
      const data = deps.engine.getData()
      const next = {
        rowCount: data.getRowCount(),
        colCount: data.getSchema().fields.length + count,
      }
      if (deps.engine.resizeExcelWorkspace(next)) deps.markMutated()
    },
    resizeWorkspace: (size) => {
      if (deps.engine.resizeExcelWorkspace(size)) deps.markMutated()
    },
  }
}

export interface ExcelWorkspaceBindingDeps {
  readonly engine: GridEngine
  afterEngineMutation(): void
}

export class ExcelWorkspaceBinding {
  private excelWorkspaceController?: ExcelWorkspaceController
  private excelWorkspaceMutated = false
  private deps: ExcelWorkspaceBindingDeps

  constructor(opts: {
    readonly policy?: Partial<ExcelWorkspacePolicy>
    readonly deps: ExcelWorkspaceBindingDeps
  }) {
    this.deps = opts.deps
    this.excelWorkspaceController = new ExcelWorkspaceController({
      policy: opts.policy,
      port: createExcelWorkspacePort({
        engine: opts.deps.engine,
        markMutated: () => {
          this.excelWorkspaceMutated = true
        },
      }),
    })
  }

  recordScroll(source: NativeScrollSource | undefined): void {
    if (!this.excelWorkspaceController) return
    const atMs = source?.atMs ?? Date.now()
    if (!source || source.kind === 'scrollbar') {
      this.excelWorkspaceController.recordScrollbarScroll(atMs)
      return
    }
    if (source.kind === 'programmatic') {
      this.excelWorkspaceController.recordProgrammaticScroll(atMs)
      return
    }
    this.excelWorkspaceController.recordWheel(source)
  }

  runFrame(): void {
    if (!this.excelWorkspaceController) return
    this.excelWorkspaceMutated = false
    this.excelWorkspaceController.afterScrollFrame(Date.now())
    if (this.excelWorkspaceMutated) this.deps.afterEngineMutation()
  }
}
