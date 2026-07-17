import type { Meta, StoryObj } from '@storybook/html'
import { SparseExcelDataSource, withExcelHeaders } from '@zhiguang/core'

import { createGridHost } from '../grid-host'
import { docsMeta, docsStory } from '../story-docs'
import autoGrowSrc from './snippets/excel-workspace.autogrow.snippet.ts?raw'

const meta: Meta = {
  title: 'Table/Excel workspace',
  ...docsMeta(
    'Excel workspace starts at A-Z x 1000. Wheel-driven edge scrolling grows only when the edge has materialized content; scrollbar drags do not grow blank capacity.',
  ),
}
export default meta

type Story = StoryObj

export const AutoGrowWorkspace: Story = {
  name: 'Auto-grow sparse workspace',
  ...docsStory(autoGrowSrc),
  render: () => {
    const data = new SparseExcelDataSource()
    data.updateCell(0, 'A', 'NovaSheet')
    data.updateCell(1, 'A', 'Excel workspace')
    data.updateCell(2, 'B', 'A-Z x 1000')
    data.updateCell(999, 'A', 'edge content')

    const host = createGridHost(
      withExcelHeaders({
        data,
        excelWorkspace: true,
      }),
    )
    ;(host as HTMLElement & { __excelWorkspaceData: SparseExcelDataSource }).__excelWorkspaceData =
      data
    return host
  },
}
