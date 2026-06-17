import { describe, expect, it } from 'bun:test'

import {
  EXCEL_SCENARIO_BOARD_ROWS,
  EXCEL_SCENARIO_BOARD_STATS,
} from '../generated/excel-scenario-board'
import { ExcelScenarioBoard } from './ExcelScenarioBoard.stories'

describe('Excel Scenario Board Storybook stories', () => {
  it('renders NovaExcel scenario matrix with toolbar', async () => {
    const render = ExcelScenarioBoard.render
    expect(render).toBeDefined()

    const host = render!({}, {} as never) as HTMLElement & {
      __scenarioBoardData: { getRowCount(): number }
      __reactRoot: { unmount(): void }
    }
    await Promise.resolve()

    expect(EXCEL_SCENARIO_BOARD_STATS.total).toBe(EXCEL_SCENARIO_BOARD_ROWS.length)
    expect(EXCEL_SCENARIO_BOARD_STATS.covered).toBe(EXCEL_SCENARIO_BOARD_STATS.total)
    expect(host.querySelector('[data-novasheet-react-excel]')).not.toBeNull()
    expect(host.querySelector('[data-novasheet-react-grid]')).not.toBeNull()
    expect(host.querySelector('[role="toolbar"]')).not.toBeNull()
    expect(host.querySelector('canvas')).not.toBeNull()
    expect(host.__scenarioBoardData.getRowCount()).toBe(EXCEL_SCENARIO_BOARD_ROWS.length + 1)

    host.__reactRoot.unmount()
  })
})
