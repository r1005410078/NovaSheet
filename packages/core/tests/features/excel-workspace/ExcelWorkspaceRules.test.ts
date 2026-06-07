import { describe, expect, it } from 'bun:test'

import {
  DEFAULT_EXCEL_WORKSPACE_POLICY,
  decideExcelWorkspaceResize,
} from '../../../src/features/excel-workspace'

describe('ExcelWorkspaceRules', () => {
  it('keeps the default A-Z x 1000 workspace without edge content', () => {
    const decision = decideExcelWorkspaceResize({
      policy: DEFAULT_EXCEL_WORKSPACE_POLICY,
      nowMs: 1_000,
      size: { rowCount: 1_000, colCount: 26 },
      visible: { rows: [970, 999], cols: [0, 25] },
      contentBounds: null,
      intent: { kind: 'wheel', atMs: 950, deltaX: 0, deltaY: 120 },
      hasMaterializedRows: false,
      hasMaterializedCols: false,
      lastGrowAtMs: null,
    })

    expect(decision).toEqual({ kind: 'none' })
  })

  it('grows rows on wheel-driven bottom edge when edge content exists', () => {
    const decision = decideExcelWorkspaceResize({
      policy: DEFAULT_EXCEL_WORKSPACE_POLICY,
      nowMs: 1_000,
      size: { rowCount: 1_000, colCount: 26 },
      visible: { rows: [970, 999], cols: [0, 25] },
      contentBounds: { startRow: 0, endRow: 999, startCol: 0, endCol: 4 },
      intent: { kind: 'wheel', atMs: 950, deltaX: 0, deltaY: 120 },
      hasMaterializedRows: true,
      hasMaterializedCols: false,
      lastGrowAtMs: null,
    })

    expect(decision).toEqual({ kind: 'grow', rows: 200, cols: 0 })
  })

  it('does not grow when the same scroll position came from scrollbar drag', () => {
    const decision = decideExcelWorkspaceResize({
      policy: DEFAULT_EXCEL_WORKSPACE_POLICY,
      nowMs: 1_000,
      size: { rowCount: 1_000, colCount: 26 },
      visible: { rows: [970, 999], cols: [0, 25] },
      contentBounds: { startRow: 0, endRow: 999, startCol: 0, endCol: 4 },
      intent: { kind: 'scrollbar', atMs: 950 },
      hasMaterializedRows: true,
      hasMaterializedCols: false,
      lastGrowAtMs: null,
    })

    expect(decision).toEqual({ kind: 'none' })
  })

  it('shrinks blank row capacity to content bounds plus buffer', () => {
    const decision = decideExcelWorkspaceResize({
      policy: DEFAULT_EXCEL_WORKSPACE_POLICY,
      nowMs: 5_000,
      size: { rowCount: 2_000, colCount: 26 },
      visible: { rows: [100, 130], cols: [0, 25] },
      contentBounds: { startRow: 0, endRow: 850, startCol: 0, endCol: 4 },
      intent: { kind: 'scrollbar', atMs: 4_900 },
      hasMaterializedRows: false,
      hasMaterializedCols: false,
      lastGrowAtMs: 1_000,
    })

    expect(decision).toEqual({ kind: 'shrink', rowCount: 1_051, colCount: 26 })
  })
})
