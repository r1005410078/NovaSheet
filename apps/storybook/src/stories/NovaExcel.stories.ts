import type { Meta, StoryObj } from '@storybook/html'
import { SparseExcelDataSource } from '@novasheet/core'
import { NovaExcel } from '@novasheet/react'
import React from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'

import { docsMeta, docsStory } from '../story-docs'
import novaExcelSrc from './snippets/react.nova-excel.snippet.ts?raw'

const meta: Meta = {
  title: 'Table/React',
  parameters: { layout: 'fullscreen' },
  ...docsMeta(
    '`NovaExcel` bundles NovaSheetGrid, NovaSheetToolbar, and built-in action wiring. Defaults to `SparseExcelDataSource` + `excelWorkspace: true` (A–Z × 1000 sparse infinite cells). Use `NovaSheetGrid` for a plain grid without toolbar.',
  ),
}
export default meta

type Story = StoryObj

function createDemoData(): SparseExcelDataSource {
  const data = new SparseExcelDataSource()
  data.updateCell(0, 'A', 'NovaSheet')
  data.updateCell(1, 'A', 'Excel workspace')
  data.updateCell(2, 'B', 'A-Z x 1000')
  data.updateCell(999, 'A', 'edge content')
  // 数字（文本工作区里存为字符串）——选中后用工具栏「数字格式」套货币/百分比演示 Phase 5-C。
  data.updateCell(0, 'C', '1234.5')
  data.updateCell(1, 'C', '0.1357')
  data.updateCell(2, 'C', '1234567')
  return data
}

export const NovaExcelOutOfTheBox: Story = {
  name: 'NovaExcel (out of the box)',
  ...docsStory(
    novaExcelSrc,
    'Single import with `SparseExcelDataSource` + `excelWorkspace: true` (defaults). Toolbar actions, selection sync, undo/redo, fill, borders, merge, and text-wrap are wired internally. Scroll to row 1000 edge content to trigger workspace auto-grow.',
  ),
  render: () => {
    const data = createDemoData()

    const host = document.createElement('div')
    host.style.width = '100%'
    host.style.height = '100vh'
    host.style.minHeight = '560px'

    const root = createRoot(host)
    ;(host as unknown as HTMLElement & { __reactRoot: typeof root }).__reactRoot = root
    ;(host as unknown as HTMLElement & { __excelWorkspaceData: SparseExcelDataSource }).__excelWorkspaceData =
      data
    flushSync(() => {
      root.render(
        React.createElement(NovaExcel, {
          data,
          locale: 'zh-CN', // CNY 显示为 ¥（en-US 下会是 CN¥）
          className: 'h-full w-full',
        }),
      )
    })

    return host
  },
}
