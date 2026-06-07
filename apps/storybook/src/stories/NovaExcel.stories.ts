import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource } from '@novasheet/core'
import { NovaExcel } from '@novasheet/react'
import React from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'

import { basicTextSchema, generateRows } from '../mock-data'
import { docsMeta, docsStory } from '../story-docs'
import novaExcelSrc from './snippets/react.nova-excel.snippet.ts?raw'

const meta: Meta = {
  title: 'Table/React',
  parameters: { layout: 'fullscreen' },
  ...docsMeta(
    '`NovaExcel` bundles NovaSheetGrid, NovaSheetToolbar, and built-in action wiring for an Excel-style out-of-the-box experience. Use `NovaSheetGrid` when you need a plain grid without toolbar chrome.',
  ),
}
export default meta

type Story = StoryObj

export const NovaExcelOutOfTheBox: Story = {
  name: 'NovaExcel (out of the box)',
  ...docsStory(
    novaExcelSrc,
    'Single import: toolbar actions, selection sync, undo/redo, fill, borders, merge, and text-wrap are wired internally. Default `excelHeaders: true` shows A/B column labels and row numbers.',
  ),
  render: () => {
    const schema = basicTextSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 100) })

    const host = document.createElement('div')
    host.style.width = '100%'
    host.style.height = '100vh'
    host.style.minHeight = '560px'

    const root = createRoot(host)
    ;(host as unknown as HTMLElement & { __reactRoot: typeof root }).__reactRoot = root
    flushSync(() => {
      root.render(
        React.createElement(NovaExcel, {
          data,
          className: 'h-full w-full',
        }),
      )
    })

    return host
  },
}
