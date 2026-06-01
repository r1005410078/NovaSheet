import type { Meta, StoryObj } from '@storybook/html'
import type { Grid } from '@novasheet/sheet'
import { InMemoryDataSource, type Schema } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { generateRows } from '../mock-data'
import { docsMeta, docsStory } from '../story-docs'
import sizingCustomSrc from './snippets/sizing.custom.snippet.ts?raw'

const meta: Meta = {
  title: 'Table/Sizing',
  ...docsMeta(
    'Non-uniform schema column widths plus single-row height overrides via `setRowHeight`.',
  ),
}
export default meta

type Story = StoryObj

export const CustomColumnWidthsAndRowHeights: Story = {
  name: 'Custom column widths and row heights',
  ...docsStory(sizingCustomSrc),
  render: () => {
    const schema: Schema = {
      fields: [
        { id: 'tiny', name: 'Tiny', type: 'text', width: 60 },
        { id: 'medium', name: 'Medium', type: 'text', width: 140 },
        { id: 'wide', name: 'Wide', type: 'text', width: 320 },
        { id: 'count', name: 'Count', type: 'number', width: 90 },
      ],
    }
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 60) })

    const host = createGridHost({ data })
    const grid = (host as HTMLElement & { __grid: Grid }).__grid
    grid.setRowHeight(0, 56)
    grid.setRowHeight(1, 40)
    grid.setRowHeight(2, 20)
    return host
  },
}
