import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource, SparseExcelDataSource } from '@novasheet/core'
import { NovaExcel } from '@novasheet/react'
import React from 'react'
import { flushSync } from 'react-dom'

import { createReactStoryHost } from '../react-story-host'
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

function createCustomRowHeaderData(): InMemoryDataSource {
  return new InMemoryDataSource({
    schema: {
      fields: [
        { id: 'name', name: '名称', type: 'text', width: 180 },
        { id: 'status', name: '状态', type: 'text', width: 120 },
      ],
    },
    rows: [
      { deviceCode: '设备-001', name: '电池组 A', status: '运行' },
      { deviceCode: '设备-002', name: '电池组 B', status: '待机' },
      { deviceCode: '设备-003', name: '电池组 C', status: '停止' },
    ],
  })
}

export const NovaExcelOutOfTheBox: Story = {
  name: 'NovaExcel (out of the box)',
  ...docsStory(
    novaExcelSrc,
    'Single import with `SparseExcelDataSource` + `excelWorkspace: true` (defaults). Toolbar actions, selection sync, undo/redo, fill, borders, merge, and text-wrap are wired internally. Scroll to row 1000 edge content to trigger workspace auto-grow.',
  ),
  render: () => {
    const data = createDemoData()
    const host = createReactStoryHost()
    host.style.width = '100%'
    host.style.height = '100vh'
    host.style.minHeight = '560px'

    ;(host as typeof host & { __excelWorkspaceData: SparseExcelDataSource }).__excelWorkspaceData = data
    flushSync(() => {
      host.__reactRoot.render(
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

export const CustomRowHeader: Story = {
  name: 'Custom row header',
  ...docsStory(
    '<NovaExcel data={data} excelWorkspace={false} rowHeaderField="deviceCode" showToolbar={false} />',
    "Uses each row data object's deviceCode as the Excel row header. The deviceCode field remains outside the body schema.",
  ),
  render: () => {
    const data = createCustomRowHeaderData()
    const host = createReactStoryHost()
    host.style.width = '100%'
    host.style.height = '100vh'
    host.style.minHeight = '560px'

    ;(host as typeof host & { __customRowHeaderData: InMemoryDataSource }).__customRowHeaderData = data
    flushSync(() => {
      host.__reactRoot.render(
        React.createElement(NovaExcel, {
          data,
          excelWorkspace: false,
          rowHeaderField: 'deviceCode',
          showToolbar: false,
          className: 'h-full w-full',
        }),
      )
    })

    return host
  },
}
