import { describe, expect, it } from 'bun:test'

import {
  DEFAULT_EXCEL_WORKSPACE_POLICY,
  ExcelWorkspaceController,
} from '../../../src/features/excel-workspace'

describe('ExcelWorkspaceController', () => {
  it('appends rows once when wheel reaches materialized bottom edge', () => {
    const appended: number[] = []
    const controller = new ExcelWorkspaceController({
      policy: DEFAULT_EXCEL_WORKSPACE_POLICY,
      port: {
        getSize: () => ({ rowCount: 1_000, colCount: 26 }),
        getVisibleRange: () => ({ rows: [970, 999], cols: [0, 25] }),
        getContentBounds: () => ({ startRow: 0, endRow: 999, startCol: 0, endCol: 3 }),
        hasMaterializedRows: () => true,
        hasMaterializedCols: () => false,
        appendRows: (count) => appended.push(count),
        appendCols: () => {},
        resizeWorkspace: () => {},
      },
    })

    controller.recordWheel({ atMs: 1_000, deltaX: 0, deltaY: 120 })
    controller.afterScrollFrame(1_010)

    expect(appended).toEqual([200])
  })

  it('shrinks blank capacity after cooldown', () => {
    const resized: Array<{ rowCount: number; colCount: number }> = []
    const controller = new ExcelWorkspaceController({
      policy: DEFAULT_EXCEL_WORKSPACE_POLICY,
      port: {
        getSize: () => ({ rowCount: 2_000, colCount: 26 }),
        getVisibleRange: () => ({ rows: [20, 60], cols: [0, 25] }),
        getContentBounds: () => ({ startRow: 0, endRow: 800, startCol: 0, endCol: 5 }),
        hasMaterializedRows: () => false,
        hasMaterializedCols: () => false,
        appendRows: () => {},
        appendCols: () => {},
        resizeWorkspace: (size) => resized.push(size),
      },
    })

    controller.afterScrollFrame(2_000)

    expect(resized).toEqual([{ rowCount: 1_001, colCount: 26 }])
  })
})
