import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource, dateToSerial, type Row, type Schema } from '@zhiguang/novasheet-core'
import type { Grid } from '@zhiguang/novasheet-core'
import { createGridHost } from '../grid-host'
import { docsMeta, docsStory } from '../story-docs'

const meta: Meta = {
  title: 'Table/Column drag reorder (Phase 4.7)',
  parameters: { layout: 'fullscreen' },
  ...docsMeta(
    'Phase 4.7: click a column header to select a column, then drag from the selected header. During drag, the DOM shows a gray target band and dark drop line; releasing commits the new column order.',
  ),
}
export default meta

type Story = StoryObj

function reorderSchema(): Schema {
  return {
    fields: [
      { id: 'name', name: 'Name', type: 'text', width: 140 },
      { id: 'team', name: 'Team', type: 'text', width: 120 },
      { id: 'revenue', name: 'Revenue', type: 'number', width: 110 },
      { id: 'date', name: 'Start date', type: 'date', width: 140 },
      { id: 'active', name: 'Active', type: 'checkbox', width: 80 },
    ],
  }
}

function makeRows(n: number): Row[] {
  const teams = ['Platform', 'Data', 'Design']
  const base = Date.UTC(2024, 0, 1)
  return Array.from({ length: n }, (_, i) => ({
    name: `Employee ${String(i + 1).padStart(3, '0')}`,
    team: teams[i % teams.length]!,
    revenue: (i + 1) * 1000,
    date: dateToSerial(new Date(base + i * 86400000)),
    active: i % 2 === 0,
  }))
}

const defaultSource = `
const data = new InMemoryDataSource({ schema, rows })
createGridHost({ data })

// Manual: click a column header to select it, then press inside the selected header and drag; release to commit the order.
`

export const Default: Story = {
  name: 'Default select-then-drag',
  ...docsStory(
    defaultSource,
    'Click any column header to select the whole column, then drag inside the selected header to a target position. The drag preview shows only a gray target band and dark drop line.',
  ),
  render: () => {
    const data = new InMemoryDataSource({ schema: reorderSchema(), rows: makeRows(100) })
    return createGridHost({ data })
  },
}

const multiColumnSource = `
const data = new InMemoryDataSource({ schema, rows })
const host = createGridHost({ data })
const grid: Grid = (host as any).__grid

grid.setSelection({
  activeCell: { rowIndex: 0, colIndex: 1 },
  anchorCell: { rowIndex: 0, colIndex: 1 },
  extentCell: { rowIndex: rows.length - 1, colIndex: 2 },
  selectedRange: { startRow: 0, endRow: rows.length - 1, startCol: 1, endCol: 2 },
})
`

export const MultiColumn: Story = {
  name: 'Multi-column preselected team + revenue',
  ...docsStory(
    multiColumnSource,
    'The team + revenue columns are preselected when the story opens. Drag inside either selected header to move the contiguous column group.',
  ),
  render: () => {
    const rows = makeRows(80)
    const data = new InMemoryDataSource({ schema: reorderSchema(), rows })
    const host = createGridHost({ data })
    const grid = (host as unknown as { __grid: Grid }).__grid
    grid.setSelection({
      activeCell: { rowIndex: 0, colIndex: 1 },
      anchorCell: { rowIndex: 0, colIndex: 1 },
      extentCell: { rowIndex: rows.length - 1, colIndex: 2 },
      selectedRange: { startRow: 0, endRow: rows.length - 1, startCol: 1, endCol: 2 },
    })
    return host
  },
}

const hiddenColsSource = `
const data = new InMemoryDataSource({ schema, rows })
const host = createGridHost({ data })
const grid: Grid = (host as any).__grid

grid.hideCols(['date'])
grid.moveCols(['team', 'revenue'], null)
`

export const HiddenCols: Story = {
  name: 'Hidden columns keep fieldId anchoring',
  ...docsStory(
    hiddenColsSource,
    'The date column is pre-hidden. Dragging visible columns only uses visible column boundaries; hidden columns are not draggable objects or standalone drop targets.',
  ),
  render: () => {
    const data = new InMemoryDataSource({ schema: reorderSchema(), rows: makeRows(80) })
    const host = createGridHost({ data })
    const grid = (host as unknown as { __grid: Grid }).__grid
    grid.hideCols(['date'])
    grid.moveCols(['team', 'revenue'], null)
    return host
  },
}
