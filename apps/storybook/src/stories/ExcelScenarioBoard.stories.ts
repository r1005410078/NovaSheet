import type { Meta, StoryObj } from '@storybook/html'
import React from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'

import { ExcelScenarioBoardHost, buildScenarioBoardData } from '../excel-scenario-board-host'
import { EXCEL_SCENARIO_BOARD_STATS } from '../generated/excel-scenario-board'
import { docsMeta, docsStory } from '../story-docs'

const meta: Meta = {
  title: 'Table/React',
  parameters: { layout: 'fullscreen' },
  ...docsMeta(
    'NovaExcel **行为场景看板**：21 条 L3 场景来自 `scenarios.manifest.json`；**测试覆盖**列绿（`#34a353`）= 有对应 `it("excel.L3x…")`，红（`#ea4335`）= 缺失。改场景 MD 后执行 `bun run sync:mbd-manifest` 与 `bun run --filter @zhiguang/novasheet-storybook sync:excel-scenario-board`。',
  ),
}
export default meta

type Story = StoryObj

const boardSnippet = `import { NovaExcel } from '@zhiguang/novasheet-react'
import { InMemoryDataSource } from '@zhiguang/novasheet-core'
// Rows + fill colors generated from scenarios.manifest.json — see ExcelScenarioBoardHost.

<NovaExcel data={boardData} excelWorkspace={false} />`

export const ExcelScenarioBoard: Story = {
  name: 'Excel Scenario Board',
  ...docsStory(
    boardSnippet,
    `Read-only matrix of ${EXCEL_SCENARIO_BOARD_STATS.total} excel L3 scenarios. Coverage column uses the same rules as \`lint:scenario-coverage\` (${EXCEL_SCENARIO_BOARD_STATS.covered}/${EXCEL_SCENARIO_BOARD_STATS.total} covered).`,
  ),
  render: () => {
    const data = buildScenarioBoardData()

    const host = document.createElement('div')
    host.style.width = '100%'
    host.style.height = '100vh'
    host.style.minHeight = '560px'

    const root = createRoot(host)
    ;(host as unknown as HTMLElement & { __reactRoot: typeof root }).__reactRoot = root
    ;(host as unknown as HTMLElement & { __scenarioBoardData: ReturnType<typeof buildScenarioBoardData> }).__scenarioBoardData =
      data

    flushSync(() => {
      root.render(React.createElement(ExcelScenarioBoardHost))
    })

    return host
  },
}
