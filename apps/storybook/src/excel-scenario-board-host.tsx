import { InMemoryDataSource, type Row, type Schema } from '@zhiguang/core'
import { NovaExcel, type NovaExcelRef } from '@zhiguang/react'
import React, { useEffect, useMemo, useRef } from 'react'

import {
  EXCEL_SCENARIO_BOARD_ROWS,
  type ExcelScenarioBoardRow,
} from './generated/excel-scenario-board'

const COVERAGE_COL = 3
const USER_STORY_COL = 4
const HEADER_FILL = '#f3f3f3'

function scenarioBoardSchema(): Schema {
  return {
    fields: [
      { id: 'layer', name: 'Layer', type: 'text', width: 56 },
      { id: 'id', name: 'Scenario ID', type: 'text', width: 240 },
      { id: 'summary', name: 'Summary', type: 'text', width: 280 },
      { id: 'coverage', name: '测试覆盖', type: 'text', width: 88 },
      { id: 'userStory', name: 'User Story', type: 'text', width: 420 },
    ],
  }
}

function boardRowToDataRow(row: ExcelScenarioBoardRow): Row {
  return {
    layer: row.layer,
    id: row.id,
    summary: row.summary,
    coverage: row.coverage === 'covered' ? '完成' : '缺失',
    userStory: row.userStory,
  }
}

function buildScenarioBoardData(): InMemoryDataSource {
  const schema = scenarioBoardSchema()
  const headerRow: Row = {
    layer: 'Layer',
    id: 'Scenario ID',
    summary: 'Summary',
    coverage: '测试覆盖',
    userStory: 'User Story',
  }
  const rows = [headerRow, ...EXCEL_SCENARIO_BOARD_ROWS.map(boardRowToDataRow)]
  return new InMemoryDataSource({ schema, rows })
}

function applyScenarioBoardFormatting(grid: NovaExcelRef['grid']): void {
  const lastRow = EXCEL_SCENARIO_BOARD_ROWS.length

  grid.setFillColor(
    { startRow: 0, endRow: 0, startCol: 0, endCol: USER_STORY_COL },
    HEADER_FILL,
  )

  for (let i = 0; i < EXCEL_SCENARIO_BOARD_ROWS.length; i++) {
    const boardRow = EXCEL_SCENARIO_BOARD_ROWS[i]!
    const dataRow = i + 1
    grid.setFillColor(
      {
        startRow: dataRow,
        endRow: dataRow,
        startCol: COVERAGE_COL,
        endCol: COVERAGE_COL,
      },
      boardRow.fillColor,
    )
  }

  grid.setTextWrap(
    { startRow: 1, endRow: lastRow, startCol: USER_STORY_COL, endCol: USER_STORY_COL },
    'wrap',
  )
}

export interface ExcelScenarioBoardHostProps {
  readonly className?: string
}

/** NovaExcel read-only matrix of excel L3 behavioral scenarios with coverage fill colors. */
export function ExcelScenarioBoardHost({
  className = 'h-full w-full',
}: ExcelScenarioBoardHostProps): React.ReactElement {
  const ref = useRef<NovaExcelRef>(null)
  const data = useMemo(() => buildScenarioBoardData(), [])

  useEffect(() => {
    let cancelled = false

    const apply = (): void => {
      if (cancelled) return
      try {
        const grid = ref.current?.grid
        if (!grid) {
          requestAnimationFrame(apply)
          return
        }
        applyScenarioBoardFormatting(grid)
      } catch {
        requestAnimationFrame(apply)
      }
    }

    requestAnimationFrame(apply)
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <NovaExcel ref={ref} data={data} excelWorkspace={false} className={className} />
  )
}

export { buildScenarioBoardData, scenarioBoardSchema }
